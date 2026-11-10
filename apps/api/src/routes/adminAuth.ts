import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { AdminUserDoc, Database } from '../db.js';
import { audit } from '../lib/audit.js';
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from '../lib/passwords.js';
import { AppError, decrypt, encrypt, ipPrefix, newTotpSecret, randomToken, sha256, verifyTotp } from '../lib/util.js';
import { ABSOLUTE_MS, IDLE_MS, requireRole, SESSION_COOKIE } from '../middleware/auth.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export function publicUser(u: AdminUserDoc) {
  return { id: String(u._id), email: u.email, role: u.role, totpEnabled: u.totpEnabled, mustChangePassword: u.mustChangePassword };
}

export function adminAuthRouter(d: Database, cfg: Config): Router {
  const r = Router();
  const loginLimiter = rateLimit({ windowMs: 60_000, limit: cfg.limits.login, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited', message: 'Too many attempts.' } });

  const cookieOpts = { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict' as const, path: '/admin', maxAge: ABSOLUTE_MS };

  r.post('/login', loginLimiter, async (req, res) => {
    const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), totp: z.string().max(10).optional() }).strict().parse(req.body);
    const email = body.email.toLowerCase();
    const user = await d.c.users.findOne({ email });
    const generic = new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
    if (!user || user.disabled) {
      await dummyVerify(body.password);
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(429, 'locked', 'Too many failed attempts. Try again later.');
    const fail = async () => {
      const fails = user.failedLogins + 1;
      await d.c.users.updateOne({ _id: user._id }, { $set: { failedLogins: fails, ...(fails >= MAX_FAILS ? { lockedUntil: new Date(Date.now() + LOCK_MS) } : {}) } });
      req.admin = { user, session: undefined as never };
      await audit(d, req, fails >= MAX_FAILS ? 'auth.locked' : 'auth.login_failed', user.email);
      req.admin = undefined;
    };
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      await fail();
      throw generic;
    }
    let totpVerified = false;
    if (user.totpEnabled && user.totpSecretEnc) {
      if (!body.totp) throw new AppError(401, 'totp_required', 'Enter your 6-digit authentication code.');
      if (!verifyTotp(decrypt(cfg.totpKey, user.totpSecretEnc), body.totp)) {
        await fail();
        throw new AppError(401, 'invalid_totp', 'The authentication code is incorrect.');
      }
      totpVerified = true;
    }
    const token = randomToken();
    const now = new Date();
    const csrfToken = randomToken(24);
    await d.c.sessions.insertOne({
      _id: sha256(token),
      userId: user._id!,
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + IDLE_MS),
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS),
      totpVerified,
      ipPrefix: ipPrefix(req.ip),
    });
    await d.c.users.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lastLoginAt: now }, $unset: { lockedUntil: '' } });
    req.admin = { user, session: undefined as never };
    await audit(d, req, 'auth.login', user.email, totpVerified ? '2FA verified' : 'password only');
    res.cookie(SESSION_COOKIE, token, cookieOpts);
    res.json({ user: publicUser(user), csrfToken });
  });

  r.get('/me', requireRole('viewer', cfg, { allowMustChange: true }), (req, res) => {
    res.json({ user: publicUser(req.admin!.user), csrfToken: req.admin!.session.csrfToken, totpVerified: req.admin!.session.totpVerified, require2fa: cfg.require2fa });
  });

  r.post('/logout', requireRole('viewer', cfg, { allowMustChange: true }), async (req, res) => {
    await d.c.sessions.deleteOne({ _id: req.admin!.session._id });
    await audit(d, req, 'auth.logout');
    res.clearCookie(SESSION_COOKIE, { ...cookieOpts, maxAge: undefined });
    res.json({ ok: true });
  });

  r.post('/password', requireRole('viewer', cfg, { allowMustChange: true }), async (req, res) => {
    const body = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }).strict().parse(req.body);
    const user = req.admin!.user;
    if (!(await verifyPassword(user.passwordHash, body.current))) throw new AppError(400, 'invalid_password', 'Current password is incorrect.');
    const problem = passwordProblem(body.next, user.email);
    if (problem) throw new AppError(400, 'weak_password', problem);
    await d.c.users.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(body.next), mustChangePassword: false } });
    // Sign out every other session for this user.
    await d.c.sessions.deleteMany({ userId: user._id!, _id: { $ne: req.admin!.session._id } });
    await audit(d, req, 'auth.password_changed');
    res.json({ ok: true });
  });

  r.post('/totp/setup', requireRole('viewer', cfg), async (req, res) => {
    const user = req.admin!.user;
    if (user.totpEnabled) throw new AppError(409, 'totp_already_enabled', 'Two-factor authentication is already on. Ask an owner to reset it.');
    const secret = newTotpSecret();
    await d.c.users.updateOne({ _id: user._id }, { $set: { totpPendingEnc: encrypt(cfg.totpKey, secret) } });
    const label = encodeURIComponent(`Lattice Admin:${user.email}`);
    res.json({ secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=Lattice%20Admin&algorithm=SHA1&digits=6&period=30` });
  });

  r.post('/totp/enable', requireRole('viewer', cfg), async (req, res) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    const user = req.admin!.user;
    if (!user.totpPendingEnc) throw new AppError(400, 'no_pending_totp', 'Start setup first.');
    const secret = decrypt(cfg.totpKey, user.totpPendingEnc);
    if (!verifyTotp(secret, code)) throw new AppError(400, 'invalid_totp', 'The authentication code is incorrect.');
    await d.c.users.updateOne({ _id: user._id }, { $set: { totpEnabled: true, totpSecretEnc: encrypt(cfg.totpKey, secret) }, $unset: { totpPendingEnc: '' } });
    await d.c.sessions.updateOne({ _id: req.admin!.session._id }, { $set: { totpVerified: true } });
    await audit(d, req, 'auth.totp_enabled');
    res.json({ ok: true });
  });

  return r;
}
