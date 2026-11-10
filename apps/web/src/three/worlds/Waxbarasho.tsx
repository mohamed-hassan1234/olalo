'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import gsap from 'gsap';
import { type Group, type InstancedMesh, type Mesh, Object3D } from 'three';
import type { Station } from '@lattice/shared';
import { useStore } from '@/lib/store';
import { WAX_NODES, WORLD_POS } from '@/lib/shots';
import { prng } from '../Environment';
import { fx } from '../fx';
import { makeGlowMaterial } from '../materials';
import { makePanelTexture } from '../panelTextures';

const KINDS = ['code', 'vault', 'forge', 'path'] as const;
const ASSEMBLY = 36;

function Shards({ count, pbr }: { count: number; pbr: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const group = useRef<Group>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = prng(21);
    const o = new Object3D();
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const a = t * Math.PI * 2 * 7 + r() * 0.6;
      const rad = 6 + r() * 9 + Math.sin(t * 9) * 1.5;
      o.position.set(Math.cos(a) * rad, 1 + t * 66 + r() * 2, Math.sin(a) * rad);
      const s = 0.35 + r() * 0.8 * (1 - t * 0.5);
      o.scale.set(s * 0.55, s * 1.7, s * 0.55);
      o.rotation.set(r() * 0.5, r() * Math.PI, r() * 0.5);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count]);
  useFrame((s) => {
    if (group.current) group.current.position.y = Math.sin(s.clock.elapsedTime * (Math.PI / 3)) * 0.8;
  });
  return (
    <group ref={group}>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        {pbr ? (
          <meshStandardMaterial color="#2E8BFF" emissive="#1F5FBF" emissiveIntensity={0.9} roughness={0.25} metalness={0.1} transparent opacity={0.85} flatShading />
        ) : (
          <meshBasicMaterial color="#3D8EF5" transparent opacity={0.8} />
        )}
      </instancedMesh>
    </group>
  );
}

/** Shards spiral in and lock into the holographic panel frame when a node opens. */
function Assembly({ index }: { index: number }) {
  const ref = useRef<InstancedMesh>(null);
  const data = useMemo(() => {
    const r = prng(100 + index);
    return Array.from({ length: ASSEMBLY }, (_, i) => {
      const per = (i / ASSEMBLY) * 4;
      const side = Math.floor(per);
      const f = per - side;
      const tx = side === 0 ? -3.5 + 7 * f : side === 1 ? 3.5 : side === 2 ? 3.5 - 7 * f : -3.5;
      const ty = side === 0 ? 2.35 : side === 1 ? 2.35 - 4.7 * f : side === 2 ? -2.35 : -2.35 + 4.7 * f;
      return { from: [(r() - 0.5) * 24, (r() - 0.5) * 18, (r() - 0.5) * 24], to: [tx, ty, 0.2], spin: r() * 6 };
    });
  }, [index]);
  const o = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const e = 1 - Math.pow(1 - fx.assembly, 3);
    data.forEach((d, i) => {
      const a = (1 - e) * d.spin;
      o.position.set(d.from[0]! + (d.to[0]! - d.from[0]!) * e, d.from[1]! + (d.to[1]! - d.from[1]!) * e, d.from[2]! + (d.to[2]! - d.from[2]!) * e);
      o.scale.setScalar(0.22);
      o.rotation.set(a, a * 2, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ASSEMBLY]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#BFDBFF" toneMapped={false} />
    </instancedMesh>
  );
}

/** One knowledge point grown on the tree: a branch from the trunk, a glowing node and a 3D-anchored label. */
function KnowledgeNode({ i, station, active, open, onPick }: { i: number; station: Station; active: boolean; open: boolean; onPick: () => void }) {
  const n = WAX_NODES[i]!;
  const x = Math.cos(n.angle) * n.r;
  const z = Math.sin(n.angle) * n.r;
  const orb = useRef<Mesh>(null);
  const lang = useStore((s) => s.lang);
  const tex = useMemo(() => (open ? makePanelTexture(KINDS[i]!, true) : null), [i, open]);
  useEffect(() => () => tex?.dispose(), [tex]);
  useFrame((s) => {
    if (!orb.current) return;
    const pulse = 1 + Math.sin(s.clock.elapsedTime * 2.2 + i) * 0.12;
    orb.current.scale.setScalar((open ? 1.45 : 1) * pulse);
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!active || e.delta > 6) return; // a drag is not a tap
    e.stopPropagation();
    onPick();
  };
  return (
    <group>
      {/* branch from the trunk */}
      <mesh position={[x / 2, n.y, z / 2]} rotation={[0, -n.angle, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, n.r, 6]} />
        <meshBasicMaterial color={open ? '#F2F6FF' : '#7FB8FF'} transparent opacity={open ? 0.95 : 0.55} toneMapped={false} />
      </mesh>
      <group position={[x, n.y, z]}>
        <mesh ref={orb} onClick={click}>
          <sphereGeometry args={[0.9, 20, 14]} />
          <meshBasicMaterial color={open ? '#FFFFFF' : '#BFDBFF'} toneMapped={false} />
        </mesh>
        <Billboard>
          <mesh>
            <ringGeometry args={[1.5, 1.75, 40]} />
            <meshBasicMaterial color={open ? '#F2F6FF' : '#2E8BFF'} transparent opacity={0.8} toneMapped={false} />
          </mesh>
        </Billboard>
        {/* generous invisible touch target */}
        <mesh onClick={click} visible={false}>
          <sphereGeometry args={[3.2, 8, 6]} />
        </mesh>
        {active && (
          <Html position={[0, 2.6, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
            <button
              type="button"
              tabIndex={-1}
              onClick={onPick}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold backdrop-blur transition ${
                open ? 'scale-110 border-white bg-primary-strong text-white' : 'border-[rgba(127,184,255,0.55)] bg-[rgba(10,18,48,0.78)] text-ink hover:border-white'
              }`}
            >
              <span className="font-mono text-[10px] text-primary-soft">{String(i + 1).padStart(2, '0')}</span>
              {station.name[lang]}
            </button>
          </Html>
        )}
        {open && tex && (
          <Billboard position={[0, 6.2, 0]}>
            <mesh>
              <planeGeometry args={[7, 4.7]} />
              <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
            </mesh>
            <Assembly index={i} />
          </Billboard>
        )}
      </group>
    </group>
  );
}

/**
 * Waxbarasho — the knowledge tree. Drag (mouse or finger) to turn it; it keeps a slow living drift.
 * The four learning points grow on the helix; choosing one turns it to face the camera.
 */
export function Waxbarasho({ shards, pbr, stations }: { shards: number; pbr: boolean; stations: Station[] }) {
  const phase = useStore((s) => s.phase);
  const world = useStore((s) => s.world);
  const station = useStore((s) => s.station);
  const motion = useStore((s) => s.motion);
  const openWorld = useStore((s) => s.openWorld);
  const openStation = useStore((s) => s.openStation);
  const camera = useThree((s) => s.camera);
  const active = phase === 'world' && world === 'waxbarasho';
  const halo = useMemo(() => makeGlowMaterial('#2E8BFF', 0.55), []);
  const tree = useRef<Group>(null);
  const spin = useRef({ y: 0, v: 0, dragging: false, lastX: 0 });
  const p = WORLD_POS.waxbarasho;

  useEffect(() => {
    if (!active || station === null) return;
    fx.assembly = 0;
    const tw = gsap.to(fx, { assembly: 1, duration: 1.2, ease: 'power2.out' });
    return () => {
      tw.kill();
    };
  }, [active, station]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = spin.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      s.lastX = e.clientX;
      s.y += dx * 0.009;
      s.v = dx * 0.009;
    };
    const up = () => (spin.current.dragging = false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  useFrame((_s, dt) => {
    halo.uniforms.uOpacity!.value = active ? 0.06 : 0.25 + 0.35 * fx.worlds;
    const s = spin.current;
    if (!s.dragging) {
      if (active && station !== null) {
        // Turn the chosen node to face the camera along the shortest path.
        const c = Math.atan2(camera.position.z - p[2], camera.position.x - p[0]);
        const target = WAX_NODES[station]!.angle - c;
        let d = (target - s.y) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        s.y += d * Math.min(1, dt * 3.5);
        s.v = 0;
      } else {
        s.v *= 0.94;
        s.y += s.v + (motion === 'full' ? dt * 0.06 : 0);
      }
    }
    if (tree.current) tree.current.rotation.y = s.y;
  });

  return (
    <group
      position={p}
      onClick={(e) => {
        if (phase === 'hub') {
          e.stopPropagation();
          openWorld('waxbarasho');
        }
      }}
    >
      <Billboard position={[0, 34, 0]}>
        <mesh material={halo}>
          <planeGeometry args={[150, 150]} />
        </mesh>
      </Billboard>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[24, 26, 1, 48]} />
        <meshStandardMaterial color="#0A1230" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[18, 0.12, 6, 96]} />
        <meshBasicMaterial color="#2E8BFF" transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 70, 0]} color="#9CC4FF" intensity={active ? 900 : 600} distance={120} decay={1.5} />
      <group ref={tree}>
        <mesh position={[0, 36, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 74, 12]} />
          <meshBasicMaterial color="#F2F6FF" toneMapped={false} />
        </mesh>
        <mesh position={[0, 36, 0]}>
          <cylinderGeometry args={[2, 2, 74, 16, 1, true]} />
          <meshBasicMaterial color="#2E8BFF" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <Shards count={active ? shards : Math.max(120, Math.floor(shards / 4))} pbr={pbr} />
        {stations.slice(0, WAX_NODES.length).map((st, i) => (
          <KnowledgeNode key={st.id} i={i} station={st} active={active} open={active && station === i} onPick={() => openStation(i)} />
        ))}
      </group>
      {/* Invisible grab volume: dragging anywhere on the tree turns it. */}
      {active && (
        <mesh
          position={[0, 34, 0]}
          visible={false}
          onPointerDown={(e) => {
            spin.current.dragging = true;
            spin.current.lastX = e.nativeEvent.clientX;
          }}
        >
          <cylinderGeometry args={[17, 17, 70, 16]} />
        </mesh>
      )}
    </group>
  );
}
