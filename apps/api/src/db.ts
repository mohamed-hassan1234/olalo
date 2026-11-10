import { MongoClient, type Collection, type Db, type Document, type ObjectId } from 'mongodb';
import type { DeviceClass, EventType, FeedbackAnswer, FpsBucket, Lang, QualityProfile, SiteContent, WorldId } from '@lattice/shared';

export type Role = 'viewer' | 'editor' | 'publisher' | 'owner';
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, publisher: 3, owner: 4 };

export interface RawEventDoc {
  _id?: ObjectId;
  receivedAt: Date;
  day: string;
  ts: Date;
  type: EventType;
  scene?: string;
  world?: WorldId;
  station?: string;
  deviceClass: DeviceClass;
  profile: QualityProfile;
  lang: Lang;
  src?: string;
  newToday?: boolean;
  fcpMs?: number;
  hubMs?: number;
  fps?: FpsBucket;
  worldsVisited?: number;
  aggregated: boolean;
  demo?: boolean;
}

export interface MetricDoc {
  _id?: ObjectId;
  /** 'YYYY-MM-DD' (daily) or 'YYYY-MM-DDTHH' (hourly), Mogadishu time. */
  bucket: string;
  bucketStart: Date;
  metric: 'events' | 'load_fcp' | 'load_hub' | 'filtered';
  key: string;
  dims: Record<string, string | number | boolean>;
  count: number;
  /** Load-time histogram, fields b0…b9 (see LOAD_BUCKETS_MS). */
  h?: Record<string, number>;
}

export interface FeedbackDoc {
  _id?: ObjectId;
  receivedAt: Date;
  day: string;
  answer: FeedbackAnswer;
  comment?: string;
  commentExpiresAt?: Date;
  lang: Lang;
  profile: QualityProfile;
  reviewed: boolean;
  demo?: boolean;
}

export interface ContentVersionDoc {
  _id?: ObjectId;
  version: number;
  status: 'draft' | 'published' | 'superseded';
  content: SiteContent;
  checksum: string;
  note: string;
  createdAt: Date;
  createdBy: ObjectId;
  createdByEmail: string;
  publishedAt?: Date;
  publishedBy?: ObjectId;
  rollbackOf?: number;
}

export interface AdminUserDoc {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  role: Role;
  disabled: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpSecretEnc?: string;
  totpPendingEnc?: string;
  failedLogins: number;
  lockedUntil?: Date;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface AdminSessionDoc {
  _id: string; // sha256(token)
  userId: ObjectId;
  csrfToken: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  totpVerified: boolean;
  ipPrefix: string;
}

export interface AuditDoc {
  _id?: ObjectId;
  ts: Date;
  actorId?: ObjectId;
  actorEmail?: string;
  action: string;
  target?: string;
  summary?: string;
  requestId: string;
  ipPrefix: string;
}

export interface SettingsDoc {
  _id: 'global';
  postElectionMode: boolean;
  publishLock: boolean;
  containsDemoData: boolean;
  rawRetentionDays: number;
  hourlyRetentionDays: number;
  dailyRetentionDays: number;
  commentRetentionDays: number;
  updatedAt: Date;
  updatedBy?: string;
}

export interface Collections {
  events: Collection<RawEventDoc>;
  hourly: Collection<MetricDoc>;
  daily: Collection<MetricDoc>;
  feedback: Collection<FeedbackDoc>;
  content: Collection<ContentVersionDoc>;
  users: Collection<AdminUserDoc>;
  sessions: Collection<AdminSessionDoc>;
  audit: Collection<AuditDoc>;
  settings: Collection<SettingsDoc>;
}

export interface Database {
  client: MongoClient;
  db: Db;
  c: Collections;
}

export const DEFAULT_SETTINGS: Omit<SettingsDoc, 'updatedAt'> = {
  _id: 'global',
  postElectionMode: false,
  publishLock: false,
  containsDemoData: false,
  rawRetentionDays: 14,
  hourlyRetentionDays: 90,
  dailyRetentionDays: 400,
  commentRetentionDays: 90,
};

const DAY = 86_400;

/** $jsonSchema validators: the database rejects documents that break the privacy model even if code regresses. */
const validators: Record<string, Document> = {
  events_raw: {
    bsonType: 'object',
    required: ['receivedAt', 'day', 'ts', 'type', 'deviceClass', 'profile', 'lang', 'aggregated'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      receivedAt: { bsonType: 'date' },
      day: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      ts: { bsonType: 'date' },
      type: { bsonType: 'string' },
      scene: { bsonType: 'string' },
      world: { enum: ['waxbarasho', 'midnimo', 'hoggaan'] },
      station: { bsonType: 'string', maxLength: 40 },
      deviceClass: { enum: ['mobile', 'tablet', 'desktop'] },
      profile: { enum: ['high', 'balanced', 'lite', 'text'] },
      lang: { enum: ['so', 'en'] },
      src: { bsonType: 'string', maxLength: 24 },
      newToday: { bsonType: 'bool' },
      fcpMs: { bsonType: ['int', 'long', 'double'] },
      hubMs: { bsonType: ['int', 'long', 'double'] },
      fps: { bsonType: 'string' },
      worldsVisited: { bsonType: ['int', 'long', 'double'] },
      aggregated: { bsonType: 'bool' },
      demo: { bsonType: 'bool' },
    },
  },
  feedback: {
    bsonType: 'object',
    required: ['receivedAt', 'day', 'answer', 'lang', 'profile', 'reviewed'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      receivedAt: { bsonType: 'date' },
      day: { bsonType: 'string' },
      answer: { enum: ['haa', 'qayb', 'maya'] },
      comment: { bsonType: 'string', maxLength: 280 },
      commentExpiresAt: { bsonType: 'date' },
      lang: { enum: ['so', 'en'] },
      profile: { enum: ['high', 'balanced', 'lite', 'text'] },
      reviewed: { bsonType: 'bool' },
      demo: { bsonType: 'bool' },
    },
  },
  admin_users: {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'role', 'disabled', 'totpEnabled', 'failedLogins', 'createdAt'],
    properties: {
      email: { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+$' },
      passwordHash: { bsonType: 'string', pattern: '^\\$argon2id\\$' },
      role: { enum: ['viewer', 'editor', 'publisher', 'owner'] },
      disabled: { bsonType: 'bool' },
      totpEnabled: { bsonType: 'bool' },
    },
  },
  content_versions: {
    bsonType: 'object',
    required: ['version', 'status', 'content', 'checksum', 'createdAt', 'createdBy'],
    properties: {
      version: { bsonType: ['int', 'long'] },
      status: { enum: ['draft', 'published', 'superseded'] },
      content: { bsonType: 'object' },
    },
  },
  audit_log: {
    bsonType: 'object',
    required: ['ts', 'action', 'requestId'],
    properties: { ts: { bsonType: 'date' }, action: { bsonType: 'string' } },
  },
};

async function ensureCollection(db: Db, name: string): Promise<void> {
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  const validator = validators[name];
  if (!exists) {
    await db.createCollection(name, validator ? { validator: { $jsonSchema: validator }, validationLevel: 'strict', validationAction: 'error' } : {});
  } else if (validator) {
    await db.command({ collMod: name, validator: { $jsonSchema: validator }, validationLevel: 'strict', validationAction: 'error' });
  }
}

export async function connect(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'lattice-api' });
  await client.connect();
  const db = client.db(dbName);
  return { client, db, c: collections(db) };
}

export function collections(db: Db): Collections {
  return {
    events: db.collection<RawEventDoc>('events_raw'),
    hourly: db.collection<MetricDoc>('metrics_hourly'),
    daily: db.collection<MetricDoc>('metrics_daily'),
    feedback: db.collection<FeedbackDoc>('feedback'),
    content: db.collection<ContentVersionDoc>('content_versions'),
    users: db.collection<AdminUserDoc>('admin_users'),
    sessions: db.collection<AdminSessionDoc>('admin_sessions'),
    audit: db.collection<AuditDoc>('audit_log'),
    settings: db.collection<SettingsDoc>('settings'),
  };
}

/** Creates collections, validators, indexes (including TTL retention) and the settings document. Idempotent. */
export async function ensureSchema(d: Database): Promise<void> {
  for (const name of ['events_raw', 'metrics_hourly', 'metrics_daily', 'feedback', 'content_versions', 'admin_users', 'admin_sessions', 'audit_log', 'settings']) {
    await ensureCollection(d.db, name);
  }
  await d.c.settings.updateOne({ _id: 'global' }, { $setOnInsert: { ...DEFAULT_SETTINGS, updatedAt: new Date() } }, { upsert: true });
  const s = (await d.c.settings.findOne({ _id: 'global' }))!;
  const { c } = d;
  await c.events.createIndex({ receivedAt: 1 }, { name: 'ttl_receivedAt', expireAfterSeconds: s.rawRetentionDays * DAY });
  await c.events.createIndex({ aggregated: 1, receivedAt: 1 }, { name: 'aggregation_queue' });
  await c.hourly.createIndex({ bucket: 1, metric: 1, key: 1 }, { name: 'bucket_metric_key', unique: true });
  await c.hourly.createIndex({ bucketStart: 1 }, { name: 'ttl_bucketStart', expireAfterSeconds: s.hourlyRetentionDays * DAY });
  await c.daily.createIndex({ bucket: 1, metric: 1, key: 1 }, { name: 'bucket_metric_key', unique: true });
  await c.daily.createIndex({ bucketStart: 1 }, { name: 'bucketStart' });
  await c.feedback.createIndex({ day: 1 }, { name: 'day' });
  await c.feedback.createIndex({ commentExpiresAt: 1 }, { name: 'commentExpiresAt', sparse: true });
  await c.content.createIndex({ version: 1 }, { name: 'version', unique: true });
  await c.content.createIndex({ status: 1, version: -1 }, { name: 'status_version' });
  await c.users.createIndex({ email: 1 }, { name: 'email', unique: true });
  await c.sessions.createIndex({ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 });
  await c.sessions.createIndex({ userId: 1 }, { name: 'userId' });
  await c.audit.createIndex({ ts: -1 }, { name: 'ts' });
  await c.audit.createIndex({ ts: 1 }, { name: 'ttl_ts', expireAfterSeconds: 365 * DAY });
}

/** Applies a changed raw-event retention period to the TTL index. */
export async function applyRawRetention(d: Database, days: number): Promise<void> {
  await d.db.command({ collMod: 'events_raw', index: { name: 'ttl_receivedAt', expireAfterSeconds: days * DAY } });
}

export async function getSettings(d: Database): Promise<SettingsDoc> {
  const s = await d.c.settings.findOne({ _id: 'global' });
  return s ?? { ...DEFAULT_SETTINGS, updatedAt: new Date() };
}
