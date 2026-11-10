/**
 * Mutable values animated by GSAP timelines and read every frame by shaders.
 * Kept outside React state so animation never triggers re-renders.
 */
export const fx = {
  /** 0 → 1: Nexus seams light from base to crown. */
  seams: 0,
  /** 0 → 1: holographic rings draw on. */
  rings: 0,
  /** 0 → 1 per bridge: Waxbarasho, Midnimo, Hoggaan. */
  bridges: [0, 0, 0] as [number, number, number],
  /** 0 → 1: crown light. */
  crown: 0,
  /** 0 → 1: world silhouettes glow. */
  worlds: 0,
  /** Station assembly progress in Waxbarasho. */
  assembly: 1,
};

export function setAwakened() {
  fx.seams = 1;
  fx.rings = 1;
  fx.bridges = [1, 1, 1];
  fx.crown = 1;
  fx.worlds = 1;
}

export function resetAwakening() {
  fx.seams = 0;
  fx.rings = 0;
  fx.bridges = [0, 0, 0];
  fx.crown = 0;
  fx.worlds = 0;
}
