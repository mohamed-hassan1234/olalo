import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultContent } from '@lattice/shared';
import { totpCode } from '../lib/util.js';
import { ADMIN_ORIGIN, createUser, enrolTotp, login, patch, post, put, setup, teardown, type Admin, type Ctx } from './helpers.js';

let ctx: Ctx;
let pubSecret = '';
let ownerAdmin: Admin;
beforeAll(async () => {
  ctx = await setup();
  await createUser(ctx, 'owner@example.org', 'owner');
  await createUser(ctx, 'viewer@example.org', 'viewer');
  await createUser(ctx, 'editor@example.org', 'editor');
  await createUser(ctx, 'pub@example.org', 'publisher');
  await createUser(ctx, 'locked@example.org', 'viewer');
}, 120_000);
afterAll(async () => teardown(ctx));

describe('authentication', () => {
  it('rejects bad credentials with a generic error and sets nothing', async () => {
    const res = await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'viewer@example.org', password: 'wrong-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
    expect(res.headers['set-cookie']).toBeUndefined();
    const unknown = await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'nobody@example.org', password: 'wrong-password-123' });
    expect(unknown.body.error).toBe('invalid_credentials');
  });

  it('locks an account after 5 failures', async () => {
    for (let i = 0; i < 5; i++) await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'locked@example.org', password: 'nope-nope-nope' });
    const res = await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'locked@example.org', password: 'correct-horse-battery-7' });
    expect(res.status).toBe(429);
  });

  it('issues an HttpOnly, SameSite=Strict session cookie scoped to /admin', async () => {
    const res = await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'viewer@example.org', password: 'correct-horse-battery-7' });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/admin/);
    const stored = await ctx.d.c.sessions.findOne({});
    expect(cookie).not.toContain(stored!._id); // only the hash is stored
  });

  it('requires a session, a CSRF token and the admin origin for writes', async () => {
    expect((await request(ctx.app).get('/admin/v1/reports/summary')).status).toBe(401);
    const v = await login(ctx, 'viewer@example.org');
    expect((await v.agent.post('/admin/v1/reports/refresh').set('Origin', ADMIN_ORIGIN).send({})).status).toBe(403);
    expect((await v.agent.post('/admin/v1/reports/refresh').set('Origin', 'http://evil.test').set('X-CSRF-Token', v.csrf).send({})).status).toBe(403);
    expect((await post(v, '/admin/v1/reports/refresh')).status).toBe(200);
  });

  it('logs out and invalidates the session', async () => {
    const v = await login(ctx, 'viewer@example.org');
    expect((await post(v, '/admin/v1/auth/logout')).status).toBe(200);
    expect((await v.agent.get('/admin/v1/auth/me')).status).toBe(401);
  });

  it('forces a password change before anything else when required', async () => {
    await createUser(ctx, 'newbie@example.org', 'viewer', { mustChangePassword: true });
    const n = await login(ctx, 'newbie@example.org');
    expect((await n.agent.get('/admin/v1/reports/summary')).status).toBe(403);
    expect((await post(n, '/admin/v1/auth/password', { current: 'correct-horse-battery-7', next: 'short' })).status).toBe(400);
    expect((await post(n, '/admin/v1/auth/password', { current: 'correct-horse-battery-7', next: 'a-much-better-passphrase-42' })).status).toBe(200);
    expect((await n.agent.get('/admin/v1/reports/summary')).status).toBe(200);
  });
});

describe('authorisation, 2FA and publishing', () => {
  it('lets a viewer read reports but not users or drafts', async () => {
    const v = await login(ctx, 'viewer@example.org');
    expect((await v.agent.get('/admin/v1/reports/summary')).status).toBe(200);
    expect((await v.agent.get('/admin/v1/users')).status).toBe(403);
    expect((await post(v, '/admin/v1/content/drafts', { content: defaultContent })).status).toBe(403);
  });

  it('runs the full draft → publish → rollback workflow with the two-person rule and 2FA', async () => {
    const editor = await login(ctx, 'editor@example.org');
    const draft = await post(editor, '/admin/v1/content/drafts', { content: defaultContent, note: 'initial structure' });
    expect(draft.status).toBe(201);
    const v1 = draft.body.version as number;

    // Pre-election rule: a "completed" claim is refused.
    const bad = structuredClone(defaultContent);
    bad.milestones[0]!.status = 'completed';
    const refused = await post(editor, '/admin/v1/content/drafts', { content: bad });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('content_rules');

    expect((await post(editor, `/admin/v1/content/${v1}/publish`)).status).toBe(403);

    const pub = await login(ctx, 'pub@example.org');
    const no2fa = await post(pub, `/admin/v1/content/${v1}/publish`);
    expect(no2fa.status).toBe(403);
    expect(no2fa.body.error).toBe('totp_required');
    const secret = await enrolTotp(pub);
    pubSecret = secret;
    const ok = await post(pub, `/admin/v1/content/${v1}/publish`);
    expect(ok.status).toBe(200);
    const pubContent = await request(ctx.app).get('/v1/content');
    expect(pubContent.headers['x-content-source']).toBe('published');
    expect(pubContent.body.version).toBe(v1);

    // Two-person rule: the publisher cannot publish their own draft.
    const own = await post(pub, '/admin/v1/content/drafts', { content: defaultContent, note: 'own' });
    expect((await post(pub, `/admin/v1/content/${own.body.version}/publish`)).status).toBe(403);

    // Next login requires the TOTP code.
    const again = await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'pub@example.org', password: 'correct-horse-battery-7' });
    expect(again.body.error).toBe('totp_required');
    const withCode = await request(ctx.app).post('/admin/v1/auth/login').send({ email: 'pub@example.org', password: 'correct-horse-battery-7', totp: totpCode(secret) });
    expect(withCode.status).toBe(200);

    const rb = await post(pub, `/admin/v1/content/${v1}/rollback`);
    expect(rb.status).toBe(200);
    const list = await pub.agent.get('/admin/v1/content');
    expect(list.body.items[0].rollbackOf).toBe(v1);
    expect(list.body.items.filter((i: { status: string }) => i.status === 'published')).toHaveLength(1);
  });

  it('owner manages users, settings and sees the audit trail; publish lock blocks publishing', async () => {
    const owner = await login(ctx, 'owner@example.org');
    expect((await owner.agent.get('/admin/v1/users')).status).toBe(403); // owner actions need 2FA
    await enrolTotp(owner);
    ownerAdmin = owner;
    expect((await owner.agent.get('/admin/v1/users')).status).toBe(200);
    expect((await post(owner, '/admin/v1/users', { email: 'x@example.org', role: 'editor', initialPassword: 'password1234' })).status).toBe(400);
    expect((await post(owner, '/admin/v1/users', { email: 'x@example.org', role: 'editor', initialPassword: 'a-strong-initial-pass-9' })).status).toBe(201);
    const me = (await owner.agent.get('/admin/v1/auth/me')).body.user.id as string;
    expect((await patch(owner, `/admin/v1/users/${me}`, { role: 'viewer' })).status).toBe(400);

    const s = await put(owner, '/admin/v1/settings', { publishLock: true, rawRetentionDays: 7 });
    expect(s.status).toBe(200);
    const idx = await ctx.d.c.events.indexes();
    expect(idx.find((i) => i.name === 'ttl_receivedAt')?.expireAfterSeconds).toBe(7 * 86_400);

    const editor = await login(ctx, 'editor@example.org');
    const draft = await post(editor, '/admin/v1/content/drafts', { content: defaultContent });
    const pub = await login(ctx, 'pub@example.org', totpCode(pubSecret));
    const locked = await post(pub, `/admin/v1/content/${draft.body.version}/publish`);
    expect(locked.status).toBe(423);
    await put(owner, '/admin/v1/settings', { publishLock: false });

    const audit = await owner.agent.get('/admin/v1/audit');
    const actions = audit.body.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login', 'content.published', 'content.rolled_back', 'users.created', 'settings.updated', 'auth.locked']));
    expect(audit.body.items.every((a: { ipPrefix: string }) => !/\d+\.\d+\.\d+\.\d+$/.test(a.ipPrefix) || a.ipPrefix.endsWith('/24'))).toBe(true);
    expect(draft.status).toBe(201);
  });

  it('a disabled user is signed out immediately', async () => {
    const v = await login(ctx, 'viewer@example.org');
    const users = (await ownerAdmin.agent.get('/admin/v1/users')).body.items as { id: string; email: string }[];
    const target = users.find((u) => u.email === 'viewer@example.org')!;
    expect((await patch(ownerAdmin, `/admin/v1/users/${target.id}`, { disabled: true })).status).toBe(200);
    expect((await v.agent.get('/admin/v1/reports/summary')).status).toBe(401);
  });
});
