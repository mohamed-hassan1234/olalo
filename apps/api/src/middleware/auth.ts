import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ROLE_RANK, type Database, type Role } from '../db.js';
import { AppError, safeEqual, sha256 } from '../lib/util.js';
import type { Config } from '../config.js';

export const SESSION_COOKIE = 'lattice_admin';
export const IDLE_MS = 8 * 3_600_000;
export const ABSOLUTE_MS = 24 * 3_600_000;

/** Loads the admin session from the HttpOnly cookie, enforcing idle and absolute expiry. */
export function loadSession(d: Database): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 20) return next();
    const id = sha256(token);
    const now = new Date();
    const session = await d.c.sessions.findOne({ _id: id });
    if (!session || session.expiresAt <= now || session.absoluteExpiresAt <= now) {
      if (session) await d.c.sessions.deleteOne({ _id: id });
      return next();
    }
    const user = await d.c.users.findOne({ _id: session.userId });
    if (!user || user.disabled) {
      await d.c.sessions.deleteOne({ _id: id });
      return next();
    }
    const expiresAt = new Date(Math.min(now.getTime() + IDLE_MS, session.absoluteExpiresAt.getTime()));
    await d.c.sessions.updateOne({ _id: id }, { $set: { lastSeenAt: now, expiresAt } });
    req.admin = { user, session: { ...session, expiresAt } };
    next();
  };
}

/** Requires a signed-in admin at or above `min`. Publisher-level actions also require a 2FA-verified session. */
export function requireRole(min: Role, cfg: Config, opts: { allowMustChange?: boolean } = {}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const a = req.admin;
    if (!a) return next(new AppError(401, 'unauthenticated', 'Sign in required.'));
    if (a.user.mustChangePassword && !opts.allowMustChange) return next(new AppError(403, 'password_change_required', 'Change your password first.'));
    if (ROLE_RANK[a.user.role] < ROLE_RANK[min]) return next(new AppError(403, 'forbidden', 'Your role does not allow this.'));
    if (cfg.require2fa && ROLE_RANK[min] >= ROLE_RANK.publisher && !(a.user.totpEnabled && a.session.totpVerified)) {
      return next(new AppError(403, 'totp_required', 'Two-factor authentication is required for this action.'));
    }
    next();
  };
}

/** Synchroniser-token CSRF check plus an Origin check for every state-changing admin request. */
export function requireCsrf(cfg: Config): RequestHandler {
  return (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.get('origin');
    if (origin && origin !== cfg.adminOrigin) return next(new AppError(403, 'bad_origin', 'Origin not allowed.'));
    const a = req.admin;
    if (!a) return next(); // requireRole answers 401
    const header = req.get('x-csrf-token') ?? '';
    if (!safeEqual(header, a.session.csrfToken)) return next(new AppError(403, 'csrf', 'Missing or invalid CSRF token.'));
    next();
  };
}
