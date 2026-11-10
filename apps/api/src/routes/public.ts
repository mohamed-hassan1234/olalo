import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { defaultContent, eventBatchSchema, feedbackSchema, scrubComment } from '@lattice/shared';
import type { Config } from '../config.js';
import type { Database, RawEventDoc } from '../db.js';
import { getSettings } from '../db.js';
import { recordFiltered } from '../services/aggregation.js';
import { AppError, localDay, roundToMinute, sha256 } from '../lib/util.js';

const BOT_UA = /bot|crawl|spider|slurp|headless|curl|wget|python-requests|httpclient|scrapy|phantom/i;

/** In-memory, hashed, short-lived: refuses a second feedback answer from the same tab session. Never persisted. */
class SessionSeen {
  private seen = new Map<string, number>();
  has(id: string, now = Date.now()): boolean {
    for (const [k, exp] of this.seen) if (exp < now) this.seen.delete(k);
    return this.seen.has(sha256(id));
  }
  add(id: string, ttlMs = 12 * 3_600_000) {
    this.seen.set(sha256(id), Date.now() + ttlMs);
  }
}

export function publicRouter(d: Database, cfg: Config): Router {
  const r = Router();
  const feedbackSeen = new SessionSeen();
  const limiter = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited', message: 'Too many requests.' } });

  r.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Latest published content snapshot (the public site falls back to its bundled copy if this fails). */
  r.get('/content', async (_req, res) => {
    const doc = await d.c.content.find({ status: 'published' }).sort({ version: -1 }).limit(1).next();
    res.set('Cache-Control', 'public, max-age=60');
    if (!doc) {
      res.set('X-Content-Source', 'default');
      res.json({ version: 0, content: defaultContent });
      return;
    }
    res.set('X-Content-Source', 'published');
    res.json({ version: doc.version, content: doc.content });
  });

  r.post('/events', limiter(cfg.limits.events), async (req, res) => {
    if (BOT_UA.test(req.get('user-agent') ?? '')) {
      await recordFiltered(d, Array.isArray(req.body?.events) ? Math.min(req.body.events.length, 50) : 1);
      res.status(204).end();
      return;
    }
    const batch = eventBatchSchema.parse(req.body);
    const ts = batch.events.map((e) => e.t);
    // Burst filter: more than 20 events inside one second is not human interaction.
    if (batch.events.length > 20 && Math.max(...ts) - Math.min(...ts) < 1000) {
      await recordFiltered(d, batch.events.length);
      res.status(204).end();
      return;
    }
    const now = new Date();
    const docs: RawEventDoc[] = batch.events.map((e) => {
      const { t: _t, ...rest } = e;
      return { ...rest, receivedAt: now, ts: roundToMinute(now), day: localDay(now), aggregated: false };
    });
    await d.c.events.insertMany(docs, { ordered: false });
    res.status(204).end();
  });

  r.post('/feedback', limiter(cfg.limits.feedback), async (req, res) => {
    const f = feedbackSchema.parse(req.body);
    if (feedbackSeen.has(f.session)) throw new AppError(409, 'already_answered', 'Already answered in this session.');
    const s = await getSettings(d);
    const now = new Date();
    const comment = f.comment ? scrubComment(f.comment, cfg.blockedNames) : '';
    await d.c.feedback.insertOne({
      receivedAt: now,
      day: localDay(now),
      answer: f.answer,
      lang: f.lang,
      profile: f.profile,
      reviewed: false,
      ...(comment ? { comment, commentExpiresAt: new Date(now.getTime() + s.commentRetentionDays * 86_400_000) } : {}),
    });
    feedbackSeen.add(f.session);
    res.status(201).json({ ok: true });
  });

  return r;
}
