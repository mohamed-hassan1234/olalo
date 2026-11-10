'use client';
import { useMemo, useRef } from 'react';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, LineCurve3, type Mesh, type MeshBasicMaterial, TubeGeometry, Vector3 } from 'three';
import type { Station } from '@lattice/shared';
import { useStore } from '@/lib/store';
import { MID_RADIUS, WORLD_POS } from '@/lib/shots';
import { fx } from '../fx';
import { makeFlowMaterial, makeGlowMaterial } from '../materials';

const N = 7;
const local = (i: number) => {
  const a = (i / N) * Math.PI * 2 - Math.PI / 2;
  return new Vector3(Math.cos(a) * MID_RADIUS, 1.5, Math.sin(a) * MID_RADIUS);
};

/** The Weave: seven hex platforms around the agora, joined by emerald filaments that stay lit once explored. */
export function Midnimo({ stations }: { stations: Station[] }) {
  const stationIds = stations.map((s) => s.id);
  const lang = useStore((s) => s.lang);
  const wave = useRef<Mesh>(null);
  const phase = useStore((s) => s.phase);
  const world = useStore((s) => s.world);
  const station = useStore((s) => s.station);
  const lit = useStore((s) => s.lit);
  const openWorld = useStore((s) => s.openWorld);
  const openStation = useStore((s) => s.openStation);
  const light = useStore((s) => s.light);
  const active = phase === 'world' && world === 'midnimo';
  const halo = useMemo(() => makeGlowMaterial('#19D49A', 0.5), []);

  const spokes = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const end = local(i);
        const start = end.clone().setLength(9.5).setY(1.5);
        const geo = new TubeGeometry(new LineCurve3(start, end.clone().setLength(MID_RADIUS - 5).setY(1.5)), 24, 0.22, 6, false);
        const mat = makeFlowMaterial('#19D49A');
        mat.uniforms.uReveal!.value = 1;
        return { geo, mat };
      }),
    [],
  );
  const ring = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const a = local(i);
        const b = local((i + 1) % N);
        const geo = new TubeGeometry(new LineCurve3(a, b), 24, 0.1, 5, false);
        const mat = makeFlowMaterial('#19D49A');
        mat.uniforms.uReveal!.value = 1;
        mat.uniforms.uIntensity!.value = 0.18;
        return { geo, mat };
      }),
    [],
  );
  const horizon = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = local(i);
      const far = p.clone().setLength(150 + (i % 3) * 40).setY(-2);
      pts.push(p.x, p.y, p.z, far.x, far.y, far.z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, []);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    halo.uniforms.uOpacity!.value = active ? 0.05 : 0.2 + 0.35 * fx.worlds;
    spokes.forEach((sp, i) => {
      const id = stationIds[i] ?? '';
      const isLit = lit.includes(id);
      const isSel = active && station === i;
      const target = isSel ? 2.2 : isLit ? 1.2 : 0.16;
      const cur = sp.mat.uniforms.uIntensity!.value as number;
      sp.mat.uniforms.uIntensity!.value = cur + (target - cur) * 0.06;
      sp.mat.uniforms.uTime!.value = t;
      sp.mat.uniforms.uSpeed!.value = -0.5; // pulses travel toward the agora
    });
    ring.forEach((r) => (r.mat.uniforms.uTime!.value = t));
    // Selection wave: a ring expanding from the chosen platform.
    if (wave.current) {
      const k = (t * 0.8) % 1;
      wave.current.scale.setScalar(1 + k * 1.6);
      (wave.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
  });

  const pick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!active || e.delta > 6) return;
    e.stopPropagation();
    openStation(i);
    const id = stationIds[i];
    if (id) light(id);
  };

  return (
    <group
      position={WORLD_POS.midnimo}
      onClick={(e) => {
        if (phase === 'hub') {
          e.stopPropagation();
          openWorld('midnimo');
        }
      }}
    >
      <Billboard position={[0, 10, 0]}>
        <mesh material={halo}>
          <planeGeometry args={[150, 150]} />
        </mesh>
      </Billboard>
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[9, 9.4, 1, 48]} />
        <meshStandardMaterial color="#0E2A2A" roughness={0.5} metalness={0.3} emissive="#0B3B30" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 1.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[9.2, 0.16, 6, 64]} />
        <meshBasicMaterial color="#19D49A" toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[5.5, 0.07, 4, 64]} />
        <meshBasicMaterial color="#5BE3B8" transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 14, 0]} color="#5BE3B8" intensity={active ? 420 : 300} distance={90} decay={1.5} />
      {spokes.map((s, i) => (
        <mesh key={`s${i}`} geometry={s.geo} material={s.mat} />
      ))}
      {ring.map((r, i) => (
        <mesh key={`r${i}`} geometry={r.geo} material={r.mat} />
      ))}
      <lineSegments geometry={horizon}>
        <lineBasicMaterial color="#19D49A" transparent opacity={0.18} />
      </lineSegments>
      {Array.from({ length: N }, (_, i) => {
        const p = local(i);
        const sel = active && station === i;
        const isLit = lit.includes(stationIds[i] ?? '');
        return (
          <group key={i} position={p}>
            <mesh onClick={pick(i)} scale={sel ? 1.12 : 1}>
              <cylinderGeometry args={[5, 5, 0.8, 6]} />
              <meshStandardMaterial color={sel ? '#0F2E2A' : '#0F1B3A'} roughness={0.6} metalness={0.3} emissive={isLit || sel ? '#0B5A45' : '#06121F'} emissiveIntensity={sel ? 1 : 0.6} />
            </mesh>
            <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
              <torusGeometry args={[5.1, sel ? 0.22 : 0.12, 4, 6]} />
              <meshBasicMaterial color={sel ? '#B8F5DF' : isLit ? '#5BE3B8' : '#19D49A'} toneMapped={false} />
            </mesh>
            <mesh position={[0, 1.2, 0]}>
              <sphereGeometry args={[0.45, 12, 8]} />
              <meshBasicMaterial color="#F4D58D" toneMapped={false} />
            </mesh>
            <mesh onClick={pick(i)} visible={false} position={[0, 3, 0]}>
              <boxGeometry args={[12, 8, 12]} />
            </mesh>
            {sel && (
              <mesh ref={wave} position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
                <torusGeometry args={[5.4, 0.18, 4, 6]} />
                <meshBasicMaterial color="#B8F5DF" transparent opacity={0.6} toneMapped={false} />
              </mesh>
            )}
            {active && (() => {
              const out = p.clone().setY(0).normalize();
              return (
                <>
                  <mesh position={[out.x * 5.5, 0.9, out.z * 5.5]} rotation={[0, -Math.atan2(out.z, out.x), Math.PI / 2]}>
                    <cylinderGeometry args={[0.06, 0.06, 5, 4]} />
                    <meshBasicMaterial color={sel ? '#F2F6FF' : '#5BE3B8'} transparent opacity={0.7} toneMapped={false} />
                  </mesh>
                  <Html position={[out.x * 10, 1.2, out.z * 10]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        openStation(i);
                        light(stationIds[i] ?? '');
                      }}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold backdrop-blur transition ${sel ? 'scale-110 border-white bg-[#0F6B52] text-white' : isLit ? 'border-[#5BE3B8] bg-[rgba(6,40,34,0.85)] text-ink' : 'border-[rgba(25,212,154,0.5)] bg-[rgba(6,20,28,0.78)] text-ink hover:border-white'}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: isLit || sel ? '#5BE3B8' : 'rgba(91,227,184,0.4)' }} />
                      {stations[i]?.name[lang]}
                    </button>
                  </Html>
                </>
              );
            })()}
          </group>
        );
      })}
    </group>
  );
}
