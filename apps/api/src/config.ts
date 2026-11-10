import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017'),
  MONGODB_DB: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).default('lattice'),
  PUBLIC_ORIGINS: z.string().default('http://localhost:3000'),
  ADMIN_ORIGIN: z.string().default('http://localhost:5173'),
  TOTP_ENC_KEY: z.string().optional(),
  COOKIE_SECURE: bool,
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  REQUIRE_2FA: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  AGG_INTERVAL_MS: z.coerce.number().int().min(10_000).default(900_000),
  PUBLISH_DIR: z.string().optional(),
  BLOCKED_NAMES: z.string().optional(),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  mongoDb: string;
  publicOrigins: string[];
  adminOrigin: string;
  totpKey: Buffer;
  cookieSecure: boolean;
  trustProxy: number;
  require2fa: boolean;
  aggIntervalMs: number;
  publishDir?: string;
  blockedNames: string[];
  /** Per-minute limits; lowered in tests to keep them fast. */
  limits: { events: number; feedback: number; login: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const e = schema.parse(env);
  let totpKey: Buffer;
  if (e.TOTP_ENC_KEY) {
    totpKey = Buffer.from(e.TOTP_ENC_KEY, 'base64');
    if (totpKey.length !== 32) throw new Error('TOTP_ENC_KEY must be 32 bytes, base64-encoded');
  } else if (e.NODE_ENV === 'production') {
    throw new Error('TOTP_ENC_KEY is required in production');
  } else {
    // Development/test only: a per-process random key. TOTP enrolments do not survive a restart.
    totpKey = randomBytes(32);
  }
  if (e.NODE_ENV === 'production' && !e.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production (HTTPS)');
  const cfg: Config = {
    env: e.NODE_ENV,
    port: e.PORT,
    mongoUri: e.MONGODB_URI,
    mongoDb: e.MONGODB_DB,
    publicOrigins: e.PUBLIC_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    adminOrigin: e.ADMIN_ORIGIN.trim(),
    totpKey,
    cookieSecure: e.COOKIE_SECURE,
    trustProxy: e.TRUST_PROXY,
    require2fa: e.REQUIRE_2FA,
    aggIntervalMs: e.AGG_INTERVAL_MS,
    publishDir: e.PUBLISH_DIR || undefined,
    blockedNames: (e.BLOCKED_NAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    limits: { events: 60, feedback: 5, login: 10 },
  };
  return { ...cfg, ...overrides };
}
