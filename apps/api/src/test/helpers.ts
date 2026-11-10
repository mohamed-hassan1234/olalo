import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { connect, ensureSchema, type Database, type Role } from '../db.js';
import { hashPassword } from '../lib/passwords.js';
import { totpCode } from '../lib/util.js';

export const ADMIN_ORIGIN = 'http://admin.test';
export const PUBLIC_ORIGIN = 'http://site.test';

export interface Ctx {
  mongod: MongoMemoryServer;
  d: Database;
  cfg: Config;
  app: ReturnType<typeof createApp>;
}

export async function setup(overrides: Partial<Config> = {}): Promise<Ctx> {
  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  const cfg = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGINS: PUBLIC_ORIGIN, ADMIN_ORIGIN: ADMIN_ORIGIN } as NodeJS.ProcessEnv, {
    limits: { events: 1000, feedback: 1000, login: 1000 },
    ...overrides,
  });
  const d = await connect(mongod.getUri(), `t${Math.random().toString(36).slice(2, 8)}`);
  await ensureSchema(d);
  return { mongod, d, cfg, app: createApp(d, cfg) };
}

export async function teardown(ctx: Ctx) {
  await ctx.d.client.close();
  await ctx.mongod.stop();
}

export const PASSWORD = 'correct-horse-battery-7';

export async function createUser(ctx: Ctx, email: string, role: Role, extra: { mustChangePassword?: boolean } = {}) {
  await ctx.d.c.users.insertOne({
    email, passwordHash: await hashPassword(PASSWORD), role, disabled: false, mustChangePassword: extra.mustChangePassword ?? false,
    totpEnabled: false, failedLogins: 0, createdAt: new Date(),
  });
}

export interface Admin {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  totpSecret?: string;
}

export async function login(ctx: Ctx, email: string, totp?: string): Promise<Admin> {
  const agent = request.agent(ctx.app);
  const res = await agent.post('/admin/v1/auth/login').set('Origin', ADMIN_ORIGIN).send({ email, password: PASSWORD, ...(totp ? { totp } : {}) });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, csrf: res.body.csrfToken };
}

/** Enrols TOTP for a signed-in admin and returns the secret. */
export async function enrolTotp(admin: Admin): Promise<string> {
  const setupRes = await admin.agent.post('/admin/v1/auth/totp/setup').set('Origin', ADMIN_ORIGIN).set('X-CSRF-Token', admin.csrf).send({});
  if (setupRes.status !== 200) throw new Error(`totp setup ${setupRes.status}`);
  const secret: string = setupRes.body.secret;
  const en = await admin.agent.post('/admin/v1/auth/totp/enable').set('Origin', ADMIN_ORIGIN).set('X-CSRF-Token', admin.csrf).send({ code: totpCode(secret) });
  if (en.status !== 200) throw new Error(`totp enable ${en.status}`);
  admin.totpSecret = secret;
  return secret;
}

export function post(admin: Admin, path: string, body: unknown = {}) {
  return admin.agent.post(path).set('Origin', ADMIN_ORIGIN).set('X-CSRF-Token', admin.csrf).send(body as object);
}
export function put(admin: Admin, path: string, body: unknown = {}) {
  return admin.agent.put(path).set('Origin', ADMIN_ORIGIN).set('X-CSRF-Token', admin.csrf).send(body as object);
}
export function patch(admin: Admin, path: string, body: unknown = {}) {
  return admin.agent.patch(path).set('Origin', ADMIN_ORIGIN).set('X-CSRF-Token', admin.csrf).send(body as object);
}

export const ev = (type: string, extra: Record<string, unknown> = {}) => ({ type, t: Date.now(), deviceClass: 'mobile', profile: 'balanced', lang: 'so', ...extra });
