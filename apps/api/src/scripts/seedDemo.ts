/**
 * Seeds or clears DEMO DATA so the dashboard can be reviewed before real traffic exists.
 * Demo records carry `demo: true` and settings.containsDemoData makes the admin app show a DEMO DATA banner.
 *
 *   npm run seed:demo -w @lattice/api            # seed 14 days
 *   npm run seed:demo -w @lattice/api -- --clear # remove all demo data and rebuild totals from real events
 */
import type { AnalyticsEvent, FeedbackAnswer } from '@lattice/shared';
import { fpsBucketFor, WORLD_IDS } from '@lattice/shared';
import { loadConfig } from '../config.js';
import { connect, ensureSchema, type Database, type RawEventDoc } from '../db.js';
import { aggregate } from '../services/aggregation.js';
import { addDays, dayStart, localDay } from '../lib/util.js';

/** Deterministic PRNG so demo numbers are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export async function seedDemo(d: Database, days = 14): Promise<void> {
  const r = rng(42);
  const today = localDay(new Date());
  const docs: RawEventDoc[] = [];
  const base = (day: string, minute: number) => new Date(dayStart(day).getTime() + 8 * 3_600_000 + minute * 60_000);
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const visitors = Math.round(150 + r() * 120 + (i === 6 ? 380 : 0));
    for (let v = 0; v < visitors; v++) {
      const deviceClass: AnalyticsEvent['deviceClass'] = r() < 0.82 ? 'mobile' : r() < 0.5 ? 'tablet' : 'desktop';
      const profile: AnalyticsEvent['profile'] = deviceClass === 'desktop' ? 'high' : r() < 0.7 ? 'balanced' : r() < 0.8 ? 'lite' : 'text';
      const ts = base(day, Math.floor(r() * 600));
      const ev = (type: AnalyticsEvent['type'], extra: Partial<RawEventDoc> = {}) =>
        docs.push({ type, deviceClass, profile, lang: r() < 0.7 ? 'so' : 'en', receivedAt: new Date(), ts, day, aggregated: false, demo: true, ...extra });
      ev('page_view', { newToday: r() < 0.62, ...(r() < 0.6 ? { src: 'qr-main-hall' } : {}) });
      ev('perf_sample', { fcpMs: Math.round(700 + r() * (deviceClass === 'mobile' ? 2600 : 1200)), hubMs: Math.round(2500 + r() * 6000), fps: fpsBucketFor(22 + r() * 40) });
      if (profile === 'text') { ev('text_mode_opened'); continue; }
      if (r() < 0.26) continue;
      ev('enter_pressed');
      if (r() < 0.25) ev('awakening_skipped'); else ev('awakening_completed');
      if (r() < 0.12) { if (r() < 0.3) ev('webgl_unavailable'); continue; }
      ev('hub_reached');
      let visited = 0;
      for (const w of WORLD_IDS) {
        if (r() < (w === 'waxbarasho' ? 0.62 : w === 'midnimo' ? 0.48 : 0.42)) {
          visited++;
          ev('world_opened', { world: w, worldsVisited: visited });
          if (r() < 0.6) ev('station_opened', { world: w, station: w === 'waxbarasho' ? 'code-lab' : w === 'midnimo' ? 'peer-mentoring' : 'responsibilities' });
        }
      }
      if (r() < 0.2) ev('roadmap_opened');
      if (r() < 0.15) ev('profile_opened');
      if (r() < 0.02) ev('asset_error');
      if (visited > 0 && r() < 0.35) ev('exit_reached', { worldsVisited: visited });
    }
  }
  await d.c.events.insertMany(docs);
  const answers: FeedbackAnswer[] = [];
  for (let i = 0; i < 286; i++) answers.push(r() < 0.64 ? 'haa' : r() < 0.66 ? 'qayb' : 'maya');
  await d.c.feedback.insertMany(
    answers.map((answer, i) => ({ answer, day: addDays(today, -(i % days)), receivedAt: new Date(), lang: 'so' as const, profile: 'balanced' as const, reviewed: false, demo: true })),
  );
  await d.c.settings.updateOne({ _id: 'global' }, { $set: { containsDemoData: true, updatedAt: new Date(), updatedBy: 'seed:demo' } });
  await aggregate(d);
}

export async function clearDemo(d: Database): Promise<void> {
  await d.c.events.deleteMany({ demo: true });
  await d.c.feedback.deleteMany({ demo: true });
  await d.c.daily.deleteMany({});
  await d.c.hourly.deleteMany({});
  await d.c.events.updateMany({}, { $set: { aggregated: false } });
  await aggregate(d);
  await d.c.settings.updateOne({ _id: 'global' }, { $set: { containsDemoData: false, updatedAt: new Date(), updatedBy: 'seed:demo --clear' } });
}

async function main() {
  const cfg = loadConfig();
  if (cfg.env === 'production') throw new Error('Refusing to seed demo data in production.');
  const d = await connect(cfg.mongoUri, cfg.mongoDb);
  try {
    await ensureSchema(d);
    if (process.argv.includes('--clear')) {
      await clearDemo(d);
      console.log('Demo data removed; totals rebuilt from real events.');
    } else {
      await seedDemo(d);
      console.log('DEMO DATA seeded (labelled in the dashboard).');
    }
  } finally {
    await d.client.close();
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seedDemo.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
