/**
 * Local development and end-to-end tests without a MongoDB install: starts an embedded mongod
 * (official MongoDB binary fetched by mongodb-memory-server) and runs the API against it.
 *
 * Data persists in apps/api/.data/mongo between runs unless DEV_EPHEMERAL=true.
 * DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD optionally create one local owner account (development only).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { start } from '../bootstrap.js';
import { hashPassword, passwordProblem } from '../lib/passwords.js';

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* no local .env: defaults apply */
  }
  if (process.env.NODE_ENV === 'production') throw new Error('devMemory is for development only');
  const ephemeral = process.env.DEV_EPHEMERAL === 'true';
  const dbPath = resolve(process.cwd(), '.data/mongo');
  if (!ephemeral) mkdirSync(dbPath, { recursive: true });
  const mongod = await MongoMemoryServer.create({ instance: { ...(ephemeral ? {} : { dbPath, storageEngine: 'wiredTiger' }) } });
  const uri = mongod.getUri();
  console.log(`[dev] embedded MongoDB at ${uri}${ephemeral ? ' (ephemeral)' : ` (data in ${dbPath})`}`);
  const { d } = await start({ ...process.env, NODE_ENV: 'development', MONGODB_URI: uri });

  const email = process.env.DEV_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.DEV_ADMIN_PASSWORD;
  if (email && password) {
    const problem = passwordProblem(password, email);
    if (problem) throw new Error(`DEV_ADMIN_PASSWORD: ${problem}`);
    if (!(await d.c.users.findOne({ email }))) {
      await d.c.users.insertOne({
        email, passwordHash: await hashPassword(password), role: 'owner', disabled: false, mustChangePassword: false,
        totpEnabled: false, failedLogins: 0, createdAt: new Date(),
      });
      console.log(`[dev] created local owner ${email}`);
    }
  }
  const stop = async () => {
    await mongod.stop();
  };
  process.on('exit', () => void stop());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
