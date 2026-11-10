'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { type Group, type InstancedMesh, Object3D } from 'three';
import type { Milestone, Station } from '@lattice/shared';
import { HoggaanIcons } from './HoggaanIcons';
import { useStore } from '@/lib/store';
import { dirOf, WORLD_POS } from '@/lib/shots';
import { fx } from '../fx';
import { makeGlowMaterial } from '../materials';

const RING_R = 22;
const RING_Y = 20;

const STATUS_COLOR: Record<Milestone['status'], string> = {
  proposed: '#2E8BFF',
  requires_approval: '#F2B544',
  in_progress: '#19D49A',
  completed: '#F2F6FF',
  not_pursued: '#5B6B82',
};

/** A milestone node: its shape, not only its colour, encodes the status (ch. 13). */
function Node({ m, selected, dim, onPick }: { m: Milestone; selected: boolean; dim: boolean; onPick: () => void }) {
  const color = STATUS_COLOR[m.status];
  const s = selected ? 1.5 : 1;
  const opacity = dim ? 0.25 : 1;
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onPick();
  };
  return (
    <group scale={s}>
      {m.status === 'completed' ? (
        <mesh>
          <sphereGeometry args={[1.3, 20, 12]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
        </mesh>
      ) : m.status === 'in_progress' ? (
        <mesh>
          <sphereGeometry args={[1.3, 20, 12, 0, Math.PI]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} side={2} />
        </mesh>
      ) : null}
      {/* Hollow ring: proposed = segmented (dashed look), approval = solid with a notch */}
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[1.4, 0.16, 6, m.status === 'proposed' ? 10 : 32]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} wireframe={m.status === 'proposed'} />
      </mesh>
      {m.status === 'requires_approval' && (
        <mesh position={[0, 1.55, 0]}>
          <boxGeometry args={[0.5, 0.7, 0.4]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
        </mesh>
      )}
      {m.status === 'not_pursued' && (
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[3.2, 0.2, 0.2]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
      )}
      {selected && (
        <mesh>
          <torusGeometry args={[2.1, 0.06, 4, 48]} />
          <meshBasicMaterial color="#F2F6FF" toneMapped={false} />
        </mesh>
      )}
      <mesh onClick={click} visible={false}>
        <sphereGeometry args={[2.6, 8, 6]} />
      </mesh>
    </group>
  );
}

function DeckDashes() {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      o.position.set(Math.cos(a) * 25, 1.25, Math.sin(a) * 25);
      o.rotation.set(0, -a, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 64]}>
      <boxGeometry args={[0.25, 0.1, 1.1]} />
      <meshBasicMaterial color="#F4D58D" transparent opacity={0.55} />
    </instancedMesh>
  );
}

/** The Observatory: an open deck under a geodesic dome, the transparent Ledger Pillar and the Roadmap Ring. */
export function Hoggaan({ milestones, stations }: { milestones: Milestone[]; stations: Station[] }) {
  const phase = useStore((s) => s.phase);
  const world = useStore((s) => s.world);
  const overlay = useStore((s) => s.overlay);
  const roadmapIndex = useStore((s) => s.roadmapIndex);
  const roadmapFilter = useStore((s) => s.roadmapFilter);
  const station = useStore((s) => s.station);
  const openWorld = useStore((s) => s.openWorld);
  const openStation = useStore((s) => s.openStation);
  const setRoadmap = useStore((s) => s.setRoadmap);
  const setOverlay = useStore((s) => s.setOverlay);
  const active = phase === 'world' && world === 'hoggaan';
  const halo = useMemo(() => makeGlowMaterial('#F4D58D', 0.4), []);
  const ringRef = useRef<Group>(null);

  const towardHub = dirOf('hoggaan').map((v) => -v) as [number, number, number];
  const front = Math.atan2(towardHub[2], towardHub[0]);
  const sorted = useMemo(() => [...milestones].sort((a, b) => a.order - b.order), [milestones]);
  const n = Math.max(sorted.length, 1);

  useFrame((s, dt) => {
    halo.uniforms.uOpacity!.value = active ? 0.04 : 0.18 + 0.3 * fx.worlds;
    const g = ringRef.current;
    if (!g) return;
    // Rotate so the selected node sits at the front, facing the hub-side camera.
    const nodeAngle = (roadmapIndex / n) * Math.PI * 2;
    const target = -(front - nodeAngle);
    let cur = g.rotation.y;
    let delta = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    cur += delta * Math.min(1, dt * 4);
    g.rotation.y = cur;
    g.position.y = RING_Y + Math.sin(s.clock.elapsedTime * 0.5) * 0.3;
  });

  const matches = (m: Milestone) =>
    roadmapFilter === 'all' ? true : roadmapFilter === 'approval' ? m.status === 'requires_approval' : m.world === roadmapFilter;

  return (
    <group
      position={WORLD_POS.hoggaan}
      onClick={(e) => {
        if (phase === 'hub') {
          e.stopPropagation();
          openWorld('hoggaan');
        }
      }}
    >
      <Billboard position={[0, 16, 0]}>
        <mesh material={halo}>
          <planeGeometry args={[150, 150]} />
        </mesh>
      </Billboard>
      {/* deck */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[30, 31, 1.2, 64]} />
        <meshStandardMaterial color="#0F1B3A" roughness={0.55} metalness={0.45} />
      </mesh>
      <mesh position={[0, 1.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[30, 0.22, 6, 128]} />
        <meshBasicMaterial color="#F4D58D" toneMapped={false} />
      </mesh>
      <DeckDashes />
      {/* dome */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[44, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#7FB8FF" wireframe transparent opacity={0.07} depthWrite={false} />
      </mesh>
      {/* Ledger Pillar */}
      <group position={[towardHub[2] * 10, 0, -towardHub[0] * 10]}>
        <mesh position={[0, 14, 0]}>
          <cylinderGeometry args={[3.4, 3.4, 26, 32, 1, true]} />
          <meshBasicMaterial color="#F4D58D" transparent opacity={0.1} side={2} depthWrite={false} />
        </mesh>
        {[5, 9.5, 14, 18.5, 23].map((y, i) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[3.8, 0.12, 4, 48]} />
            <meshBasicMaterial color="#F4D58D" transparent opacity={i < 3 ? 0.9 : 0.35} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 14, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 26, 8]} />
          <meshBasicMaterial color="#F4D58D" toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[0, 3, 0]} color="#F4D58D" intensity={active ? 380 : 300} distance={80} decay={1.4} />
      {/* symbolic 3D icons for the four sections */}
      <HoggaanIcons
        stations={stations}
        active={active && overlay !== 'roadmap'}
        station={station}
        onPick={(i) => {
          setOverlay(null);
          openStation(i);
        }}
      />
      {/* Roadmap Ring */}
      <group ref={ringRef} position={[0, RING_Y, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RING_R, 0.16, 6, 160]} />
          <meshBasicMaterial color="#F4D58D" toneMapped={false} />
        </mesh>
        {sorted.map((m, i) => {
          const a = (i / n) * Math.PI * 2;
          return (
            <group key={m.id} position={[Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R]} rotation={[0, -a + Math.PI / 2, 0]}>
              <Node
                m={m}
                selected={active && overlay === 'roadmap' && i === roadmapIndex}
                dim={!matches(m)}
                onPick={() => {
                  if (!active) return;
                  setRoadmap({ roadmapIndex: i, roadmapView: 'ring' });
                  setOverlay('roadmap');
                }}
              />
            </group>
          );
        })}
      </group>
    </group>
  );
}
