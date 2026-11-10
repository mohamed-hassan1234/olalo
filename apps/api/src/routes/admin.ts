import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { contentSchema, hasBlockingIssues, validateContentRules, type SiteContent } from '@lattice/shared';
import type { Config } from '../config.js';
import { applyRawRetention, getSettings, ROLE_RANK, type Database, type Role } from '../db.js';
import { audit } from '../lib/audit.js';
import { hashPassword, passwordProblem } from '../lib/passwords.js';
import { addDays, AppError, localDay, sha256 } from '../lib/util.js';
import { requireRole } from '../middleware/auth.js';
import { aggregate, buildReport } from '../services/aggregation.js';
import { runRetention } from '../services/retention.js';
import { publicUser } from './adminAuth.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const roleSchema = z.enum(['viewer', 'editor', 'publisher', 'owner']);
const oid = (s: string) => {
  if (!ObjectId.isValid(s)) throw new AppError(404, 'not_found', 'Not found.');
  return new ObjectId(s);
};
const checksum = (c: SiteContent) => sha256(JSON.stringify(c));

export function adminRouter(d: Database, cfg: Config): Router {
  const r = Router();
  const viewer = requireRole('viewer', cfg);
  const editor = requireRole('editor', cfg);
  const publisher = requireRole('publisher', cfg);
  const owner = requireRole('owner', cfg);

  // ---------------- Reports ----------------
  r.get('/reports/summary', viewer, async (req, res) => {
    const today = localDay(new Date());
    const q = z.object({ from: day.optional(), to: day.optional() }).parse(req.query);
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -13);
    if (from > to) throw new AppError(400, 'bad_range', '`from` must be on or before `to`.');
    const s = await getSettings(d);
    res.json(await buildReport(d, from, to, s.containsDemoData));
  });

  r.post('/reports/refresh', viewer, async (req, res) => {
    const processed = await aggregate(d);
    await audit(d, req, 'reports.refresh', undefined, `${processed} events aggregated`);
    res.json({ processed });
  });

  r.get('/feedback/comments', viewer, async (req, res) => {
    const q = z.object({ reviewed: z.enum(['true', 'false']).optional() }).parse(req.query);
    const filter = { comment: { $exists: true }, ...(q.reviewed ? { reviewed: q.reviewed === 'true' } : {}) };
    const items = await d.c.feedback.find(filter, { projection: { comment: 1, answer: 1, day: 1, reviewed: 1, lang: 1 } }).sort({ receivedAt: -1 }).limit(200).toArray();
    res.json({ items: items.map((i) => ({ id: String(i._id), day: i.day, answer: i.answer, comment: i.comment, reviewed: i.reviewed, lang: i.lang })) });
  });

  r.post('/feedback/comments/:id/reviewed', editor, async (req, res) => {
    const id = oid(String(req.params.id));
    await d.c.feedback.updateOne({ _id: id }, { $set: { reviewed: true } });
    await audit(d, req, 'feedback.reviewed', String(id));
    res.json({ ok: true });
  });

  // ---------------- Content ----------------
  r.get('/content', viewer, async (_req, res) => {
    const items = await d.c.content.find({}, { projection: { content: 0 } }).sort({ version: -1 }).limit(100).toArray();
    res.json({
      items: items.map((v) => ({
        version: v.version,
        status: v.status,
        note: v.note,
        createdAt: v.createdAt,
        createdByEmail: v.createdByEmail,
        publishedAt: v.publishedAt,
        rollbackOf: v.rollbackOf,
        checksum: v.checksum,
      })),
    });
  });

  r.get('/content/:version', viewer, async (req, res) => {
    const version = z.coerce.number().int().min(1).parse(req.params.version);
    const v = await d.c.content.findOne({ version });
    if (!v) throw new AppError(404, 'not_found', 'Version not found.');
    const s = await getSettings(d);
    res.json({ version: v.version, status: v.status, note: v.note, content: v.content, issues: validateContentRules(v.content, { postElectionMode: s.postElectionMode }) });
  });

  const nextVersion = async () => ((await d.c.content.find().sort({ version: -1 }).limit(1).next())?.version ?? 0) + 1;

  r.post('/content/validate', editor, async (req, res) => {
    const content = contentSchema.parse(req.body?.content);
    const s = await getSettings(d);
    res.json({ issues: validateContentRules(content, { postElectionMode: s.postElectionMode }) });
  });

  r.post('/content/drafts', editor, async (req, res) => {
    const body = z.object({ content: z.unknown(), note: z.string().max(300).default('') }).parse(req.body);
    const content = contentSchema.parse(body.content);
    const s = await getSettings(d);
    const issues = validateContentRules(content, { postElectionMode: s.postElectionMode });
    if (hasBlockingIssues(issues)) throw new AppError(422, 'content_rules', 'The content breaks publishing rules.', issues);
    const user = req.admin!.user;
    const version = await nextVersion();
    await d.c.content.insertOne({ version, status: 'draft', content, checksum: checksum(content), note: body.note, createdAt: new Date(), createdBy: user._id!, createdByEmail: user.email });
    await audit(d, req, 'content.draft_created', `v${version}`, body.note);
    res.status(201).json({ version, issues });
  });

  async function publishContent(content: SiteContent, version: number) {
    await d.c.content.updateMany({ status: 'published', version: { $ne: version } }, { $set: { status: 'superseded' } });
    if (cfg.publishDir) {
      await mkdir(cfg.publishDir, { recursive: true });
      await writeFile(join(cfg.publishDir, 'content.json'), JSON.stringify({ version, content }), 'utf8');
    }
  }

  r.post('/content/:version/publish', publisher, async (req, res) => {
    const version = z.coerce.number().int().min(1).parse(req.params.version);
    const s = await getSettings(d);
    if (s.publishLock) throw new AppError(423, 'publish_locked', 'Publishing is locked (for example during a campaign silence period).');
    const v = await d.c.content.findOne({ version });
    if (!v) throw new AppError(404, 'not_found', 'Version not found.');
    if (v.status !== 'draft') throw new AppError(409, 'not_draft', 'Only drafts can be published. Use rollback for older versions.');
    const user = req.admin!.user;
    if (String(v.createdBy) === String(user._id)) throw new AppError(403, 'two_person_rule', 'A different admin must publish your draft.');
    const issues = validateContentRules(v.content, { postElectionMode: s.postElectionMode });
    if (hasBlockingIssues(issues)) throw new AppError(422, 'content_rules', 'The content breaks publishing rules.', issues);
    await d.c.content.updateOne({ version }, { $set: { status: 'published', publishedAt: new Date(), publishedBy: user._id! } });
    await publishContent(v.content, version);
    await audit(d, req, 'content.published', `v${version}`);
    res.json({ ok: true, version });
  });

  r.post('/content/:version/rollback', publisher, async (req, res) => {
    const from = z.coerce.number().int().min(1).parse(req.params.version);
    const s = await getSettings(d);
    if (s.publishLock) throw new AppError(423, 'publish_locked', 'Publishing is locked.');
    const old = await d.c.content.findOne({ version: from });
    if (!old || old.status === 'draft') throw new AppError(404, 'not_found', 'Only previously published versions can be restored.');
    const issues = validateContentRules(old.content, { postElectionMode: s.postElectionMode });
    if (hasBlockingIssues(issues)) throw new AppError(422, 'content_rules', 'That version breaks current publishing rules.', issues);
    const user = req.admin!.user;
    const version = await nextVersion();
    await d.c.content.insertOne({
      version, status: 'published', content: old.content, checksum: old.checksum, note: `Rollback to v${from}`,
      createdAt: new Date(), createdBy: user._id!, createdByEmail: user.email, publishedAt: new Date(), publishedBy: user._id!, rollbackOf: from,
    });
    await publishContent(old.content, version);
    await audit(d, req, 'content.rolled_back', `v${version}`, `restored v${from}`);
    res.json({ ok: true, version });
  });

  // ---------------- Users ----------------
  r.get('/users', owner, async (_req, res) => {
    const users = await d.c.users.find().sort({ createdAt: 1 }).toArray();
    res.json({ items: users.map((u) => ({ ...publicUser(u), disabled: u.disabled, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })) });
  });

  r.post('/users', owner, async (req, res) => {
    const body = z.object({ email: z.string().email().max(200), role: roleSchema, initialPassword: z.string().max(200) }).strict().parse(req.body);
    const email = body.email.toLowerCase();
    const problem = passwordProblem(body.initialPassword, email);
    if (problem) throw new AppError(400, 'weak_password', problem);
    if ((await d.c.users.countDocuments()) >= 8) throw new AppError(409, 'too_many_admins', 'Keep the admin team small (8 accounts at most).');
    if (await d.c.users.findOne({ email })) throw new AppError(409, 'exists', 'That email already has an account.');
    const res2 = await d.c.users.insertOne({
      email, passwordHash: await hashPassword(body.initialPassword), role: body.role, disabled: false, mustChangePassword: true,
      totpEnabled: false, failedLogins: 0, createdAt: new Date(),
    });
    await audit(d, req, 'users.created', email, `role ${body.role}`);
    res.status(201).json({ id: String(res2.insertedId) });
  });

  r.patch('/users/:id', owner, async (req, res) => {
    const id = oid(String(req.params.id));
    const body = z.object({ role: roleSchema.optional(), disabled: z.boolean().optional(), resetTotp: z.boolean().optional() }).strict().parse(req.body);
    const target = await d.c.users.findOne({ _id: id });
    if (!target) throw new AppError(404, 'not_found', 'User not found.');
    const self = String(id) === String(req.admin!.user._id);
    if (self && (body.disabled || (body.role && body.role !== 'owner'))) throw new AppError(400, 'self_lockout', 'You cannot demote or disable yourself.');
    const losingOwner = target.role === 'owner' && ((body.role && body.role !== 'owner') || body.disabled);
    if (losingOwner && (await d.c.users.countDocuments({ role: 'owner', disabled: false })) <= 1) throw new AppError(400, 'last_owner', 'At least one active owner is required.');
    const set: Record<string, unknown> = {};
    if (body.role) set.role = body.role as Role;
    if (typeof body.disabled === 'boolean') set.disabled = body.disabled;
    const unset: Record<string, ''> = {};
    if (body.resetTotp) {
      set.totpEnabled = false;
      unset.totpSecretEnc = '';
      unset.totpPendingEnc = '';
    }
    await d.c.users.updateOne({ _id: id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    if (body.disabled || body.resetTotp || body.role) await d.c.sessions.deleteMany({ userId: id });
    await audit(d, req, 'users.updated', target.email, JSON.stringify(body));
    res.json({ ok: true });
  });

  // ---------------- Audit ----------------
  r.get('/audit', owner, async (req, res) => {
    const q = z.object({ before: z.string().datetime().optional() }).parse(req.query);
    const items = await d.c.audit.find(q.before ? { ts: { $lt: new Date(q.before) } } : {}).sort({ ts: -1 }).limit(100).toArray();
    res.json({ items: items.map((a) => ({ ts: a.ts, actor: a.actorEmail ?? null, action: a.action, target: a.target ?? null, summary: a.summary ?? null, ipPrefix: a.ipPrefix })) });
  });

  // ---------------- Settings ----------------
  r.get('/settings', viewer, async (_req, res) => {
    const { _id, ...s } = await getSettings(d);
    res.json({ settings: s, roleRank: ROLE_RANK });
  });

  r.put('/settings', owner, async (req, res) => {
    const body = z
      .object({
        postElectionMode: z.boolean().optional(),
        publishLock: z.boolean().optional(),
        rawRetentionDays: z.number().int().min(1).max(30).optional(),
        hourlyRetentionDays: z.number().int().min(7).max(180).optional(),
        dailyRetentionDays: z.number().int().min(30).max(730).optional(),
        commentRetentionDays: z.number().int().min(7).max(180).optional(),
      })
      .strict()
      .parse(req.body);
    await d.c.settings.updateOne({ _id: 'global' }, { $set: { ...body, updatedAt: new Date(), updatedBy: req.admin!.user.email } });
    if (body.rawRetentionDays) await applyRawRetention(d, body.rawRetentionDays);
    await audit(d, req, 'settings.updated', 'global', JSON.stringify(body));
    const { _id, ...s } = await getSettings(d);
    res.json({ settings: s });
  });

  r.post('/retention/run', owner, async (req, res) => {
    const result = await runRetention(d);
    await audit(d, req, 'retention.run', undefined, JSON.stringify(result));
    res.json(result);
  });

  return r;
}
