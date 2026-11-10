/**
 * Logical backup and restore (Extended JSON) for environments without mongodump.
 * Production should rely on the managed cluster's automated backups; this is the documented fallback
 * and the tool used for the pre-launch restore test.
 *
 *   npm run backup -w @lattice/api                       # writes backups/<timestamp>/*.json
 *   npm run backup -w @lattice/api -- --restore <folder> # restores into an EMPTY database
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BSON } from 'mongodb';
import { loadConfig } from '../config.js';
import { connect, ensureSchema } from '../db.js';

const { EJSON } = BSON;
const COLLECTIONS = ['metrics_daily', 'metrics_hourly', 'feedback', 'content_versions', 'admin_users', 'audit_log', 'settings', 'events_raw'];

async function main() {
  const cfg = loadConfig();
  const d = await connect(cfg.mongoUri, cfg.mongoDb);
  try {
    const i = process.argv.indexOf('--restore');
    if (i >= 0) {
      const dir = resolve(process.argv[i + 1] ?? '');
      for (const name of COLLECTIONS) {
        if ((await d.db.collection(name).estimatedDocumentCount()) > 0) throw new Error(`Refusing to restore: ${name} is not empty.`);
      }
      for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
        const name = file.replace(/\.json$/, '');
        if (!COLLECTIONS.includes(name)) continue;
        const docs = EJSON.parse(await readFile(join(dir, file), 'utf8')) as Record<string, unknown>[];
        if (docs.length) await d.db.collection(name).insertMany(docs);
        console.log(`restored ${name}: ${docs.length}`);
      }
      await ensureSchema(d);
      return;
    }
    const dir = resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(dir, { recursive: true });
    for (const name of COLLECTIONS) {
      const docs = await d.db.collection(name).find().toArray();
      await writeFile(join(dir, `${name}.json`), EJSON.stringify(docs, { relaxed: false }), 'utf8');
      console.log(`backed up ${name}: ${docs.length}`);
    }
    console.log(`Backup written to ${dir} (admin_sessions intentionally excluded).`);
  } finally {
    await d.client.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
