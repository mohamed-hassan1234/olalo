import type { DeviceClass, QualityProfile } from '@lattice/shared';

export interface QualitySettings {
  dpr: [number, number];
  antialias: boolean;
  bloom: boolean;
  stars: number;
  dust: number;
  shards: number;
  skyline: number;
  pbr: boolean;
  flightScale: number;
  fpsFloor: number;
}

/** Proposal ch. 23 quality profiles. Numbers are starting hypotheses to tune on real devices. */
export const QUALITY: Record<Exclude<QualityProfile, 'text'>, QualitySettings> = {
  high: { dpr: [1, 2], antialias: true, bloom: true, stars: 2200, dust: 1600, shards: 2400, skyline: 160, pbr: true, flightScale: 1, fpsFloor: 40 },
  balanced: { dpr: [1, 1.5], antialias: false, bloom: false, stars: 1200, dust: 600, shards: 1200, skyline: 90, pbr: true, flightScale: 1, fpsFloor: 28 },
  lite: { dpr: [1, 1], antialias: false, bloom: false, stars: 500, dust: 0, shards: 300, skyline: 40, pbr: false, flightScale: 0.6, fpsFloor: 20 },
};

interface Nav extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function deviceClass(): DeviceClass {
  if (typeof window === 'undefined') return 'mobile';
  const w = Math.min(window.screen?.width ?? window.innerWidth, window.innerWidth);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (coarse && w < 600) return 'mobile';
  if (coarse && w < 1100) return 'tablet';
  return w < 600 ? 'mobile' : 'desktop';
}

/** Picks the starting profile from capability hints; the frame-rate monitor corrects it live. */
export function detectQuality(): QualityProfile {
  if (typeof window === 'undefined') return 'balanced';
  const forced = new URLSearchParams(window.location.search).get('quality');
  if (forced === 'high' || forced === 'balanced' || forced === 'lite' || forced === 'text') return forced;
  if (!hasWebGL()) return 'text';
  const nav = navigator as Nav;
  const conn = nav.connection;
  if (conn?.saveData || (conn?.effectiveType && /(^|-)(2g|3g)$/.test(conn.effectiveType))) return 'lite';
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const dc = deviceClass();
  if (mem <= 2 || (dc !== 'desktop' && cores <= 4)) return 'lite';
  if (dc === 'desktop' && mem >= 8 && cores >= 8) return 'high';
  return 'balanced';
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}
