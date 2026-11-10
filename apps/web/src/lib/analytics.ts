import type { AnalyticsEvent, EventType, Lang, QualityProfile } from '@lattice/shared';
import { API_URL } from './env';
import { deviceClass } from './quality';

/**
 * Anonymous analytics: no cookies, no identifiers, no fingerprinting.
 * Events are queued in memory and sent in small batches; failures are silently dropped.
 */
const queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let ctx: { profile: QualityProfile; lang: Lang } = { profile: 'balanced', lang: 'so' };
let src: string | undefined;
let firstOfDay: boolean | undefined;

export function setAnalyticsContext(c: Partial<typeof ctx>) {
  ctx = { ...ctx, ...c };
}

function isNewToday(): boolean {
  if (firstOfDay !== undefined) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem('lattice.lastVisit');
    localStorage.setItem('lattice.lastVisit', today);
    firstOfDay = last !== today;
    return firstOfDay;
  } catch {
    firstOfDay = false;
    return false;
  }
}

export function track(type: EventType, extra: Partial<AnalyticsEvent> = {}) {
  if (!API_URL || typeof window === 'undefined') return;
  if (src === undefined) {
    const s = new URLSearchParams(window.location.search).get('src') ?? '';
    src = /^[a-z0-9-]{1,24}$/.test(s) ? s : '';
  }
  const e: AnalyticsEvent = {
    type,
    t: Date.now(),
    deviceClass: deviceClass(),
    profile: ctx.profile,
    lang: ctx.lang,
    ...(src ? { src } : {}),
    ...(type === 'page_view' && isNewToday() ? { newToday: true } : {}),
    ...extra,
  };
  queue.push(e);
  if (queue.length >= 20) flush();
  if (!timer) {
    timer = setInterval(flush, 15_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }
}

export function flush() {
  if (!queue.length || !API_URL) return;
  const events = queue.splice(0, 50);
  const body = JSON.stringify({ v: 1, events });
  try {
    // text/plain keeps the beacon a "simple" request (no CORS preflight); the API accepts it as JSON.
    const ok = navigator.sendBeacon?.(`${API_URL}/v1/events`, new Blob([body], { type: 'text/plain' }));
    if (!ok) void fetch(`${API_URL}/v1/events`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => undefined);
  } catch {
    /* analytics must never break the experience */
  }
}

/** For tests. */
export function _queued() {
  return queue;
}
