import type { AnyBulkWriteOperation } from 'mongodb';
import { LOAD_BUCKETS_MS, loadBucketIndex, percentileFromHistogram, WORLD_IDS } from '@lattice/shared';
import type { Database, MetricDoc, RawEventDoc } from '../db.js';
import { dayStart, hourStart, localDay, localHour } from '../lib/util.js';

const BATCH = 5000;

/** Percentiles falling in the open top bucket are reported as -1 ("above the last edge") so JSON keeps them. */
const openEnded = (v: number | null) => (v === Number.POSITIVE_INFINITY ? -1 : v);

function dimsOf(e: RawEventDoc): Record<string, string | number | boolean> {
  const d: Record<string, string | number | boolean> = { type: e.type, deviceClass: e.deviceClass, profile: e.profile, lang: e.lang };
  if (e.world) d.world = e.world;
  if (e.station) d.station = e.station;
  if (e.src) d.src = e.src;
  if (e.newToday) d.newToday = true;
  if (e.fps) d.fps = e.fps;
  if (typeof e.worldsVisited === 'number') d.worldsVisited = e.worldsVisited;
  return d;
}
const keyOf = (dims: Record<string, unknown>) =>
  Object.keys(dims)
    .sort()
    .map((k) => `${k}=${String(dims[k])}`)
    .join('|');

interface Acc {
  bucket: string;
  bucketStart: Date;
  metric: MetricDoc['metric'];
  key: string;
  dims: MetricDoc['dims'];
  count: number;
  h?: Record<string, number>;
}

function bump(map: Map<string, Acc>, a: Omit<Acc, 'count' | 'h'>, histIndex?: number) {
  const k = `${a.bucket}#${a.metric}#${a.key}`;
  let cur = map.get(k);
  if (!cur) {
    cur = { ...a, count: 0 };
    map.set(k, cur);
  }
  cur.count += 1;
  if (histIndex !== undefined) {
    cur.h ??= {};
    cur.h[`b${histIndex}`] = (cur.h[`b${histIndex}`] ?? 0) + 1;
  }
}

function toOps(map: Map<string, Acc>): AnyBulkWriteOperation<MetricDoc>[] {
  return [...map.values()].map((a) => {
    const inc: Record<string, number> = { count: a.count };
    for (const [b, n] of Object.entries(a.h ?? {})) inc[`h.${b}`] = n;
    return {
      updateOne: {
        filter: { bucket: a.bucket, metric: a.metric, key: a.key },
        update: { $inc: inc, $setOnInsert: { bucketStart: a.bucketStart, dims: a.dims } },
        upsert: true,
      },
    };
  });
}

/** Rolls un-aggregated raw events into hourly and daily counters. Returns the number processed. */
export async function aggregate(d: Database): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await d.c.events.find({ aggregated: false }).sort({ receivedAt: 1 }).limit(BATCH).toArray();
    if (batch.length === 0) break;
    const daily = new Map<string, Acc>();
    const hourly = new Map<string, Acc>();
    for (const e of batch) {
      const day = localDay(e.ts);
      const hour = localHour(e.ts);
      const dims = dimsOf(e);
      bump(daily, { bucket: day, bucketStart: dayStart(day), metric: 'events', key: keyOf(dims), dims });
      const hd = { type: e.type, deviceClass: e.deviceClass, ...(e.world ? { world: e.world } : {}) };
      bump(hourly, { bucket: hour, bucketStart: hourStart(hour), metric: 'events', key: keyOf(hd), dims: hd });
      if (e.type === 'perf_sample') {
        const pd = { deviceClass: e.deviceClass, profile: e.profile };
        if (typeof e.fcpMs === 'number') bump(daily, { bucket: day, bucketStart: dayStart(day), metric: 'load_fcp', key: keyOf(pd), dims: pd }, loadBucketIndex(e.fcpMs));
        if (typeof e.hubMs === 'number') bump(daily, { bucket: day, bucketStart: dayStart(day), metric: 'load_hub', key: keyOf(pd), dims: pd }, loadBucketIndex(e.hubMs));
      }
    }
    const dOps = toOps(daily);
    const hOps = toOps(hourly);
    if (dOps.length) await d.c.daily.bulkWrite(dOps, { ordered: false });
    if (hOps.length) await d.c.hourly.bulkWrite(hOps, { ordered: false });
    await d.c.events.updateMany({ _id: { $in: batch.map((e) => e._id!) } }, { $set: { aggregated: true } });
    total += batch.length;
    if (batch.length < BATCH) break;
  }
  return total;
}

export async function recordFiltered(d: Database, n: number, at = new Date()): Promise<void> {
  if (n <= 0) return;
  const day = localDay(at);
  await d.c.daily.updateOne(
    { bucket: day, metric: 'filtered', key: 'filtered' },
    { $inc: { count: n }, $setOnInsert: { bucketStart: dayStart(day), dims: {} } },
    { upsert: true },
  );
}

export interface Report {
  from: string;
  to: string;
  containsDemoData: boolean;
  totals: Record<string, number>;
  days: { day: string; pageViews: number; uniqueEst: number }[];
  funnel: { stage: string; count: number }[];
  worlds: Record<string, number>;
  stations: { world: string; station: string; count: number }[];
  devices: Record<string, number>;
  profiles: Record<string, number>;
  sources: Record<string, number>;
  fps: Record<string, number>;
  /** p50/p75 are bucket upper edges in ms; -1 means above the last edge (8 s). */
  perf: { deviceClass: string; metric: 'fcp' | 'hub'; samples: number; p50: number | null; p75: number | null }[];
  errorsPer1000: number;
  feedback: { haa: number; qayb: number; maya: number; total: number; comments: number };
  alerts: { level: 'warning' | 'info' | 'ok'; title: string; detail: string }[];
}

/** Builds the admin report for an inclusive local-day range from aggregated counters only. */
export async function buildReport(d: Database, from: string, to: string, containsDemoData: boolean): Promise<Report> {
  const docs = await d.c.daily.find({ bucket: { $gte: from, $lte: to } }).toArray();
  const totals: Record<string, number> = {};
  const byDay = new Map<string, { pageViews: number; uniqueEst: number }>();
  const worlds: Record<string, number> = Object.fromEntries(WORLD_IDS.map((w) => [w, 0]));
  const stations = new Map<string, number>();
  const devices: Record<string, number> = {};
  const profiles: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const fps: Record<string, number> = {};
  const hist = new Map<string, number[]>();
  let firstWorld = 0;
  let allThree = 0;
  let filtered = 0;

  for (const m of docs) {
    if (m.metric === 'filtered') {
      filtered += m.count;
      continue;
    }
    if (m.metric === 'load_fcp' || m.metric === 'load_hub') {
      const k = `${String(m.dims.deviceClass)}#${m.metric === 'load_fcp' ? 'fcp' : 'hub'}`;
      const arr = hist.get(k) ?? new Array(LOAD_BUCKETS_MS.length + 1).fill(0);
      for (const [b, n] of Object.entries(m.h ?? {})) {
        const i = Number(b.slice(1));
        arr[i] = (arr[i] ?? 0) + n;
      }
      hist.set(k, arr);
      continue;
    }
    const type = String(m.dims.type);
    totals[type] = (totals[type] ?? 0) + m.count;
    if (type === 'page_view') {
      const cur = byDay.get(m.bucket) ?? { pageViews: 0, uniqueEst: 0 };
      cur.pageViews += m.count;
      byDay.set(m.bucket, cur);
      devices[String(m.dims.deviceClass)] = (devices[String(m.dims.deviceClass)] ?? 0) + m.count;
      profiles[String(m.dims.profile)] = (profiles[String(m.dims.profile)] ?? 0) + m.count;
      const src = m.dims.src ? String(m.dims.src) : 'direct';
      sources[src] = (sources[src] ?? 0) + m.count;
    }
    if (m.dims.newToday === true) {
      const cur = byDay.get(m.bucket) ?? { pageViews: 0, uniqueEst: 0 };
      cur.uniqueEst += m.count;
      byDay.set(m.bucket, cur);
      totals.uniqueEst = (totals.uniqueEst ?? 0) + m.count;
    }
    if (type === 'world_opened' && m.dims.world) {
      worlds[String(m.dims.world)] = (worlds[String(m.dims.world)] ?? 0) + m.count;
      if (m.dims.worldsVisited === 1) firstWorld += m.count;
      if (m.dims.worldsVisited === 3) allThree += m.count;
    }
    if (type === 'station_opened' && m.dims.world && m.dims.station) {
      const k = `${String(m.dims.world)}/${String(m.dims.station)}`;
      stations.set(k, (stations.get(k) ?? 0) + m.count);
    }
    if (type === 'perf_sample' && m.dims.fps) fps[String(m.dims.fps)] = (fps[String(m.dims.fps)] ?? 0) + m.count;
  }
  totals.filtered = filtered;

  const days: Report['days'] = [];
  for (let day = from; day <= to; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    const v = byDay.get(day) ?? { pageViews: 0, uniqueEst: 0 };
    days.push({ day, ...v });
    if (days.length > 400) break;
  }

  const n = (k: string) => totals[k] ?? 0;
  const funnel = [
    { stage: 'Entrance (page view)', count: n('page_view') },
    { stage: 'Tapped ENTER', count: n('enter_pressed') },
    { stage: 'Reached hub', count: n('hub_reached') },
    { stage: 'Opened 1+ world', count: firstWorld },
    { stage: 'Opened all 3 worlds', count: allThree },
    { stage: 'Reached exit', count: n('exit_reached') },
  ];

  const perf: Report['perf'] = [...hist.entries()].map(([k, counts]) => {
    const [deviceClass, metric] = k.split('#') as [string, 'fcp' | 'hub'];
    return {
      deviceClass,
      metric,
      samples: counts.reduce((s, c) => s + c, 0),
      p50: openEnded(percentileFromHistogram(counts, 0.5)),
      p75: openEnded(percentileFromHistogram(counts, 0.75)),
    };
  });

  const fbRows = await d.c.feedback
    .aggregate<{ _id: string; n: number; comments: number }>([
      { $match: { day: { $gte: from, $lte: to } } },
      { $group: { _id: '$answer', n: { $sum: 1 }, comments: { $sum: { $cond: [{ $gt: ['$comment', null] }, 1, 0] } } } },
    ])
    .toArray();
  const fb = { haa: 0, qayb: 0, maya: 0, total: 0, comments: 0 };
  for (const r of fbRows) {
    if (r._id === 'haa' || r._id === 'qayb' || r._id === 'maya') fb[r._id] = r.n;
    fb.total += r.n;
    fb.comments += r.comments;
  }

  const errors = n('webgl_unavailable') + n('context_lost') + n('asset_error');
  const errorsPer1000 = n('page_view') > 0 ? Math.round((errors / n('page_view')) * 10_000) / 10 : 0;

  const alerts: Report['alerts'] = [];
  const mobileFcp = perf.find((p) => p.deviceClass === 'mobile' && p.metric === 'fcp');
  if (mobileFcp?.p75 && mobileFcp.p75 > 2500) {
    alerts.push({ level: 'warning', title: `p75 mobile first paint ≤ ${mobileFcp.p75} ms bucket`, detail: 'Above the 2.5 s target. Check the entrance payload and hub textures.' });
  }
  if (errorsPer1000 > 10) alerts.push({ level: 'warning', title: `${errorsPer1000} errors per 1,000 views`, detail: 'Above 10 per 1,000. Inspect asset_error and context_lost by device.' });
  if (filtered > 0) alerts.push({ level: 'info', title: `${filtered} events filtered`, detail: 'Dropped by bot and burst filters. Not counted in any total.' });
  if (alerts.length === 0) alerts.push({ level: 'ok', title: 'No alerts', detail: 'All monitored thresholds are within targets for this range.' });

  return {
    from,
    to,
    containsDemoData,
    totals,
    days,
    funnel,
    worlds,
    stations: [...stations.entries()].map(([k, count]) => {
      const [world, station] = k.split('/') as [string, string];
      return { world, station, count };
    }),
    devices,
    profiles,
    sources,
    fps,
    perf,
    errorsPer1000,
    feedback: fb,
    alerts,
  };
}
