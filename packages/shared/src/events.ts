import { z } from 'zod';

/** Closed list of anonymous analytics event types (proposal ch. 20). Anything else is rejected. */
export const EVENT_TYPES = [
  'page_view',
  'enter_pressed',
  'awakening_completed',
  'awakening_skipped',
  'hub_reached',
  'world_opened',
  'station_opened',
  'roadmap_opened',
  'profile_opened',
  'manifesto_opened',
  'text_mode_opened',
  'quality_downgraded',
  'webgl_unavailable',
  'context_lost',
  'asset_error',
  'share_used',
  'exit_reached',
  'perf_sample',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const WORLD_IDS = ['waxbarasho', 'midnimo', 'hoggaan'] as const;
export type WorldId = (typeof WORLD_IDS)[number];

export const QUALITY_PROFILES = ['high', 'balanced', 'lite', 'text'] as const;
export type QualityProfile = (typeof QUALITY_PROFILES)[number];

export const DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const LANGS = ['so', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Load-time histogram bucket upper edges in milliseconds; the last bucket is open-ended. */
export const LOAD_BUCKETS_MS = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000] as const;
export const FPS_BUCKETS = ['<24', '24-30', '30-45', '45-60', '60+'] as const;
export type FpsBucket = (typeof FPS_BUCKETS)[number];

const shortId = z.string().regex(/^[a-z0-9-]{1,40}$/);

export const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    /** Client clock in ms; the server rounds stored time to the minute and uses its own receive time. */
    t: z.number().int().nonnegative(),
    scene: z.enum(['entrance', 'awakening', 'hub', 'world', 'exit', 'text', 'profile', 'roadmap']).optional(),
    world: z.enum(WORLD_IDS).optional(),
    station: shortId.optional(),
    deviceClass: z.enum(DEVICE_CLASSES),
    profile: z.enum(QUALITY_PROFILES),
    lang: z.enum(LANGS),
    /** QR poster code: a location, never a person. */
    src: z.string().regex(/^[a-z0-9-]{1,24}$/).optional(),
    /** First event of a new calendar day from this browser (anonymous daily-unique estimate). */
    newToday: z.boolean().optional(),
    /** perf_sample only */
    fcpMs: z.number().int().min(0).max(120000).optional(),
    hubMs: z.number().int().min(0).max(300000).optional(),
    fps: z.enum(FPS_BUCKETS).optional(),
    /** world exploration count sent with exit_reached */
    worldsVisited: z.number().int().min(0).max(3).optional(),
  })
  .strict();
export type AnalyticsEvent = z.infer<typeof eventSchema>;

export const MAX_BATCH = 50;
export const eventBatchSchema = z
  .object({
    v: z.literal(1),
    events: z.array(eventSchema).min(1).max(MAX_BATCH),
  })
  .strict();
export type EventBatch = z.infer<typeof eventBatchSchema>;

/** Returns the index of the histogram bucket a load time falls into. */
export function loadBucketIndex(ms: number): number {
  const i = LOAD_BUCKETS_MS.findIndex((edge) => ms <= edge);
  return i === -1 ? LOAD_BUCKETS_MS.length : i;
}

/** Approximate percentile from histogram counts: returns the upper edge of the bucket that contains it. */
export function percentileFromHistogram(counts: number[], p: number): number | null {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return null;
  const target = Math.ceil(total * p);
  let running = 0;
  for (let i = 0; i < counts.length; i++) {
    running += counts[i] ?? 0;
    if (running >= target) return LOAD_BUCKETS_MS[i] ?? Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}

export function fpsBucketFor(fps: number): FpsBucket {
  if (fps < 24) return '<24';
  if (fps < 30) return '24-30';
  if (fps < 45) return '30-45';
  if (fps < 60) return '45-60';
  return '60+';
}
