import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregate, buildReport } from '../services/aggregation.js';
import { runRetention } from '../services/retention.js';
import { localDay } from '../lib/util.js';
import { ev, PUBLIC_ORIGIN, setup, teardown, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await setup({ blockedNames: ['Ahmed'] });
}, 120_000);
afterAll(async () => teardown(ctx));

const UA = 'Mozilla/5.0 (Linux; Android 13) Chrome/130 Mobile';

describe('public API', () => {
  it('reports health and serves the default content when nothing is published', async () => {
    expect((await request(ctx.app).get('/v1/health')).body).toEqual({ status: 'ok' });
    const res = await request(ctx.app).get('/v1/content');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-source']).toBe('default');
    expect(res.body.content.launch.status).toBe('blocked');
  });

  it('allows CORS only from the public origin', async () => {
    const ok = await request(ctx.app).options('/v1/events').set('Origin', PUBLIC_ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);
    const bad = await request(ctx.app).options('/v1/events').set('Origin', 'http://evil.test').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('stores a valid batch without any identifying fields', async () => {
    const res = await request(ctx.app).post('/v1/events').set('User-Agent', UA).send({ v: 1, events: [ev('page_view', { newToday: true }), ev('enter_pressed')] });
    expect(res.status).toBe(204);
    const docs = await ctx.d.c.events.find().toArray();
    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(Object.keys(doc).sort()).not.toEqual(expect.arrayContaining(['ip', 'userAgent', 'ua', 'userId', 't']));
      expect(doc.ts.getSeconds()).toBe(0);
    }
  });

  it('rejects unknown types, unknown fields and oversized batches', async () => {
    expect((await request(ctx.app).post('/v1/events').set('User-Agent', UA).send({ v: 1, events: [ev('vote_cast')] })).status).toBe(400);
    expect((await request(ctx.app).post('/v1/events').set('User-Agent', UA).send({ v: 1, events: [ev('page_view', { phone: '123' })] })).status).toBe(400);
    expect((await request(ctx.app).post('/v1/events').set('User-Agent', UA).send({ v: 1, events: Array(51).fill(ev('page_view')) })).status).toBe(400);
  });

  it('drops bot and burst traffic and only counts it as filtered', async () => {
    const before = await ctx.d.c.events.countDocuments();
    expect((await request(ctx.app).post('/v1/events').set('User-Agent', 'Googlebot/2.1').send({ v: 1, events: [ev('page_view')] })).status).toBe(204);
    const t = Date.now();
    const burst = Array.from({ length: 25 }, (_, i) => ({ ...ev('station_opened'), t: t + i }));
    expect((await request(ctx.app).post('/v1/events').set('User-Agent', UA).send({ v: 1, events: burst })).status).toBe(204);
    expect(await ctx.d.c.events.countDocuments()).toBe(before);
    const filtered = await ctx.d.c.daily.findOne({ metric: 'filtered' });
    expect(filtered?.count).toBe(26);
  });

  it('the database itself rejects documents with extra fields (schema validation)', async () => {
    await expect(
      ctx.d.c.events.insertOne({ ...(ev('page_view') as Record<string, unknown>), receivedAt: new Date(), ts: new Date(), day: '2026-01-01', aggregated: false, ip: '1.2.3.4' } as never),
    ).rejects.toThrow(/validation/i);
  });

  it('accepts one feedback answer per session, scrubs comments and refuses honeypot fills', async () => {
    const base = { answer: 'haa', lang: 'so', profile: 'balanced', session: 'session-aaaaaaaaaaaa' };
    const res = await request(ctx.app).post('/v1/feedback').send({ ...base, comment: 'Ahmed: call +252 61 555 1234 please' });
    expect(res.status).toBe(201);
    expect((await request(ctx.app).post('/v1/feedback').send(base)).status).toBe(409);
    expect((await request(ctx.app).post('/v1/feedback').send({ ...base, session: 'session-bbbbbbbbbbbb', website: 'x' })).status).toBe(400);
    const doc = await ctx.d.c.feedback.findOne({});
    expect(doc?.comment).not.toMatch(/Ahmed|555/);
    expect(doc?.commentExpiresAt).toBeInstanceOf(Date);
  });

  it('aggregates raw events into daily totals and an honest funnel', async () => {
    await request(ctx.app).post('/v1/events').set('User-Agent', UA).send({
      v: 1,
      events: [
        ev('hub_reached'),
        ev('world_opened', { world: 'waxbarasho', worldsVisited: 1 }),
        ev('world_opened', { world: 'midnimo', worldsVisited: 2 }),
        ev('world_opened', { world: 'hoggaan', worldsVisited: 3 }),
        ev('perf_sample', { fcpMs: 1800, hubMs: 5200, fps: '45-60' }),
      ],
    });
    const n = await aggregate(ctx.d);
    expect(n).toBeGreaterThanOrEqual(7);
    expect(await ctx.d.c.events.countDocuments({ aggregated: false })).toBe(0);
    const today = localDay(new Date());
    const rep = await buildReport(ctx.d, today, today, false);
    expect(rep.totals.page_view).toBe(1);
    expect(rep.totals.uniqueEst).toBe(1);
    expect(rep.funnel.find((f) => f.stage === 'Opened 1+ world')?.count).toBe(1);
    expect(rep.funnel.find((f) => f.stage === 'Opened all 3 worlds')?.count).toBe(1);
    expect(rep.worlds.waxbarasho).toBe(1);
    expect(rep.perf.find((p) => p.metric === 'fcp')?.p75).toBe(2000);
    expect(rep.feedback.haa).toBe(1);
    expect(rep.totals.filtered).toBe(26);
    // Aggregation is idempotent with respect to already-processed events.
    expect(await aggregate(ctx.d)).toBe(0);
  });

  it('retention removes expired comments but keeps the answer', async () => {
    await ctx.d.c.feedback.updateMany({}, { $set: { commentExpiresAt: new Date(Date.now() - 1000) } });
    const r = await runRetention(ctx.d);
    expect(r.commentsRemoved).toBeGreaterThanOrEqual(1);
    const doc = await ctx.d.c.feedback.findOne({});
    expect(doc?.comment).toBeUndefined();
    expect(doc?.answer).toBe('haa');
  });

  it('creates TTL indexes for raw events and sessions', async () => {
    const idx = await ctx.d.c.events.indexes();
    expect(idx.find((i) => i.name === 'ttl_receivedAt')?.expireAfterSeconds).toBe(14 * 86_400);
    const sidx = await ctx.d.c.sessions.indexes();
    expect(sidx.find((i) => i.name === 'ttl_expiresAt')?.expireAfterSeconds).toBe(0);
  });
});

describe('rate limiting', () => {
  let small: Ctx;
  beforeAll(async () => {
    small = await setup({ limits: { events: 2, feedback: 2, login: 2 } });
  }, 120_000);
  afterAll(async () => teardown(small));
  it('returns 429 after the per-minute limit', async () => {
    const send = () => request(small.app).post('/v1/events').set('User-Agent', UA).send({ v: 1, events: [ev('page_view')] });
    expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(429);
  });
});
