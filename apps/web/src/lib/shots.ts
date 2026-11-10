import type { WorldId } from '@lattice/shared';

export type V3 = [number, number, number];
export interface Shot {
  pos: V3;
  target: V3;
  fov: number;
}

/** World layout (proposal ch. 7): three worlds on a 120 m ring at 12, 4 and 8 o'clock around the Nexus. */
export const WORLD_POS: Record<WorldId, V3> = {
  waxbarasho: [0, 0, -120],
  midnimo: [103.9, 0, 60],
  hoggaan: [-103.9, 0, 60],
};

export const WORLD_COLOR: Record<WorldId, string> = { waxbarasho: '#2E8BFF', midnimo: '#19D49A', hoggaan: '#F4D58D' };

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const dirOf = (w: WorldId): V3 => norm([WORLD_POS[w][0], 0, WORLD_POS[w][2]]);

/** Named shots (ch. 11). HUB-x keeps the Nexus in the lower-left third and the world on the upper-right diagonal. */
export function hubShot(w: WorldId, portrait: boolean): Shot {
  const d = dirOf(w);
  const right = rightOf(w);
  if (portrait) {
    // Portrait separates subjects vertically: a high camera looks down past the Nexus crown (lower left)
    // to the world on the horizon (upper third).
    return { pos: add(add(scale(d, -30), scale(right, 6)), [0, 95, 0]), target: add(add(scale(d, 50), scale(right, 2)), [0, 37, 0]), fov: 60 };
  }
  // Landscape separates subjects horizontally: Nexus in the left third, world beyond it to the right.
  return { pos: add(add(scale(d, -42), scale(right, 22)), [0, 30, 0]), target: add(scale(d, 40), [0, 28, 0]), fov: 45 };
}

/** Screen-right when looking from the Nexus toward a world. */
export const rightOf = (w: WorldId): V3 => {
  const d = dirOf(w);
  return [-d[2], 0, d[0]];
};

export const AWAKENING_SHOTS = {
  crown: { pos: [6, 62, 14] as V3, target: [0, 60, 0] as V3, fov: 30 },
  reveal: { pos: [18, 40, 46] as V3, target: [0, 46, 0] as V3, fov: 40 },
  crane: { pos: [26, 14, 52] as V3, target: [0, 26, 0] as V3, fov: 50 },
};

export function exitShot(portrait: boolean): Shot {
  return { pos: [0, portrait ? 300 : 210, portrait ? 300 : 230], target: [0, 0, 0], fov: portrait ? 58 : 50 };
}

/** Waxbarasho learning stations: plinths spiral up the Vertical Library. */
export const WAX_STATIONS: { angle: number; y: number }[] = [
  { angle: 0.6, y: 4 },
  { angle: 2.4, y: 17 },
  { angle: 4.1, y: 30 },
  { angle: 5.6, y: 43 },
];
export const WAX_STATION_RADIUS = 19;

/** Knowledge-tree nodes: the four Waxbarasho points sit on the helix itself (tree-local coordinates). */
export const WAX_NODES: { angle: number; y: number; r: number }[] = [
  { angle: 0.4, y: 12, r: 11.5 },
  { angle: 2.0, y: 24, r: 10.5 },
  { angle: 3.6, y: 36, r: 9.5 },
  { angle: 5.2, y: 48, r: 8.5 },
];

export function waxStationPos(i: number): V3 {
  const s = WAX_STATIONS[i]!;
  const w = WORLD_POS.waxbarasho;
  return [w[0] + Math.cos(s.angle) * WAX_STATION_RADIUS, s.y, w[2] + Math.sin(s.angle) * WAX_STATION_RADIUS];
}

export const MID_RADIUS = 26;
export function midPlatformPos(i: number, n = 7): V3 {
  const w = WORLD_POS.midnimo;
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return [w[0] + Math.cos(a) * MID_RADIUS, 1.5, w[2] + Math.sin(a) * MID_RADIUS];
}

/**
 * In-world shots. Every overview is offset sideways from the hub axis so the camera never sits inside
 * the arriving light-bridge (which washed out the frame in the first device screenshots).
 */
export function worldShot(w: WorldId, station: number | null, portrait: boolean, roadmap = false): Shot {
  const o = WORLD_POS[w];
  const towardHub = scale(dirOf(w), -1);
  const side = rightOf(w);
  if (w === 'waxbarasho') {
    if (station === null) return { pos: add(o, add(add(scale(towardHub, portrait ? 74 : 60), scale(side, portrait ? 26 : 34)), [0, 30, 0])), target: add(o, [0, 28, 0]), fov: portrait ? 58 : 46 };
    // The tree turns the chosen node toward the camera, so the camera only moves in and up to its height.
    const ny = WAX_NODES[station]?.y ?? 28;
    const camDir = norm(add(scale(towardHub, portrait ? 74 : 60), scale(side, portrait ? 26 : 34)));
    return { pos: add(o, add(scale(camDir, portrait ? 52 : 40), [0, ny + 6, 0])), target: add(o, [0, ny, 0]), fov: portrait ? 56 : 44 };
  }
  if (w === 'midnimo') {
    if (station === null) return { pos: add(o, add(add(scale(towardHub, portrait ? 70 : 58), scale(side, 28)), [0, 56, 0])), target: add(o, [0, 0, 0]), fov: portrait ? 58 : 46 };
    // Keep the whole radial network in view; lean slightly toward the chosen platform.
    const p = midPlatformPos(station);
    const lean = scale(add(p, scale(o, -1)), 0.3);
    return { pos: add(o, add(add(scale(towardHub, portrait ? 66 : 54), scale(side, 24)), [0, 54, 0])), target: add(o, [lean[0], 0, lean[2]]), fov: portrait ? 58 : 46 };
  }
  // hoggaan
  if (roadmap) return { pos: add(o, add(add(scale(towardHub, portrait ? 34 : 28), scale(side, 10)), [0, 50, 0])), target: add(o, [0, 19, 0]), fov: portrait ? 62 : 48 };
  if (station === null) return { pos: add(o, add(add(scale(towardHub, portrait ? 56 : 48), scale(side, portrait ? 26 : 32)), [0, 12, 0])), target: add(o, [0, 15, 0]), fov: portrait ? 62 : 48 };
  const ang = hoggaanStationAngle(station);
  const p: V3 = [o[0] + Math.cos(ang) * 24, 0, o[2] + Math.sin(ang) * 24];
  const out = norm([p[0] - o[0], 0, p[2] - o[2]]);
  return { pos: add(p, add(scale(out, portrait ? 26 : 20), [0, 11, 0])), target: add(p, [0, 6, 0]), fov: portrait ? 58 : 46 };
}

/** Hoggaan station pylons sit 45° off the hub axis so no station shot looks down the bridge. */
export function hoggaanStationAngle(i: number): number {
  const t = scale(dirOf('hoggaan'), -1);
  return (i / 4) * Math.PI * 2 + Math.atan2(t[2], t[0]) + Math.PI / 4;
}
