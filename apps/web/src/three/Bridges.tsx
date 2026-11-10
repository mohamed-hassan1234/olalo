'use client';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import type { WorldId } from '@lattice/shared';
import { useStore, WORLD_ORDER } from '@/lib/store';
import { dirOf, WORLD_COLOR, WORLD_POS } from '@/lib/shots';
import { fx } from './fx';
import { makeFlowMaterial } from './materials';

/** Light-bridges from the Nexus base to each world: revealed during the Awakening, brightest for the facing world. */
export function Bridges() {
  const facing = useStore((s) => s.facing);
  const phase = useStore((s) => s.phase);
  const world = useStore((s) => s.world);

  const items = useMemo(
    () =>
      WORLD_ORDER.map((w: WorldId) => {
        const d = dirOf(w);
        const p = WORLD_POS[w];
        const start = new Vector3(d[0] * 13, 2.2, d[2] * 13);
        const end = new Vector3(p[0] - d[0] * 30, 3, p[2] - d[2] * 30);
        const mid = start.clone().lerp(end, 0.5).add(new Vector3(0, 7, 0));
        const curve = new CatmullRomCurve3([start, mid, end]);
        const geo = new TubeGeometry(curve, 96, 0.38, 8, false);
        const halo = new TubeGeometry(curve, 96, 1.6, 8, false);
        const mat = makeFlowMaterial(WORLD_COLOR[w]);
        const haloMat = makeFlowMaterial(WORLD_COLOR[w]);
        haloMat.uniforms.uIntensity!.value = 0.12;
        return { w, geo, halo, mat, haloMat };
      }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    items.forEach((it, i) => {
      const active = phase === 'world' ? it.w === world : phase === 'exit' || it.w === facing;
      const target = phase === 'entrance' || phase === 'awakening' ? 1 : active ? 1.25 : 0.45;
      const cur = it.mat.uniforms.uIntensity!.value as number;
      it.mat.uniforms.uIntensity!.value = cur + (target - cur) * 0.08;
      it.mat.uniforms.uReveal!.value = fx.bridges[i];
      it.mat.uniforms.uTime!.value = t;
      it.haloMat.uniforms.uIntensity!.value = phase === 'world' && it.w === world ? 0.03 : 0.12;
      it.haloMat.uniforms.uReveal!.value = fx.bridges[i];
      it.haloMat.uniforms.uTime!.value = t;
    });
  });

  return (
    <group>
      {items.map((it) => (
        <group key={it.w}>
          <mesh geometry={it.geo} material={it.mat} />
          <mesh geometry={it.halo} material={it.haloMat} />
        </group>
      ))}
    </group>
  );
}
