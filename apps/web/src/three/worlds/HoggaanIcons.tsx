'use client';
import { useMemo, useRef } from 'react';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BoxGeometry, EdgesGeometry, ExtrudeGeometry, type Group, Shape } from 'three';
import type { Station } from '@lattice/shared';
import { useStore } from '@/lib/store';
import { hoggaanStationAngle } from '@/lib/shots';

const GOLD = '#F4D58D';

function Gold({ hot }: { hot: boolean }) {
  return <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.28} emissive="#8A6A22" emissiveIntensity={hot ? 1.1 : 0.35} />;
}

/** Responsibilities: a shield. */
function Shield({ hot }: { hot: boolean }) {
  const geo = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 2.6);
    s.quadraticCurveTo(1.2, 2.2, 2.1, 2.5);
    s.lineTo(2.1, 0.4);
    s.quadraticCurveTo(1.9, -1.6, 0, -2.7);
    s.quadraticCurveTo(-1.9, -1.6, -2.1, 0.4);
    s.lineTo(-2.1, 2.5);
    s.quadraticCurveTo(-1.2, 2.2, 0, 2.6);
    const g = new ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 });
    g.center();
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={geo}>
        <Gold hot={hot} />
      </mesh>
      <mesh position={[0, 0.2, 0.42]}>
        <boxGeometry args={[0.35, 2.6, 0.12]} />
        <meshBasicMaterial color="#FFF3CF" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.7, 0.42]}>
        <boxGeometry args={[2.2, 0.35, 0.12]} />
        <meshBasicMaterial color="#FFF3CF" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Governance: a columned pavilion — decisions taken in the open. */
function Pavilion({ hot }: { hot: boolean }) {
  return (
    <group position={[0, -1.6, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[4.6, 0.4, 2.6]} />
        <Gold hot={hot} />
      </mesh>
      {[-1.6, -0.55, 0.55, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.6, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 2.8, 12]} />
          <Gold hot={hot} />
        </mesh>
      ))}
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[4.6, 0.35, 2.6]} />
        <Gold hot={hot} />
      </mesh>
      <mesh position={[0, 3.9, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.5]}>
        <cylinderGeometry args={[2.55, 2.55, 2.4, 3, 1]} />
        <Gold hot={hot} />
      </mesh>
    </group>
  );
}

/** Transparency Ledger: stacked glass tablets with luminous edges. */
function Ledger({ hot }: { hot: boolean }) {
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(3.6, 0.32, 2.6)), []);
  return (
    <group position={[0, -1.2, 0]}>
      {[0, 1, 2, 3].map((k) => (
        <group key={k} position={[k * 0.18 - 0.27, k * 0.85, 0]} rotation={[0, k * 0.08, 0]}>
          <mesh>
            <boxGeometry args={[3.6, 0.32, 2.6]} />
            <meshStandardMaterial color={GOLD} transparent opacity={0.28} metalness={0.2} roughness={0.1} emissive="#8A6A22" emissiveIntensity={hot ? 0.8 : 0.2} />
          </mesh>
          <lineSegments geometry={edges}>
            <lineBasicMaterial color={hot ? '#FFFFFF' : GOLD} />
          </lineSegments>
          <mesh position={[-0.6, 0.17, 0]}>
            <boxGeometry args={[1.8, 0.02, 0.12]} />
            <meshBasicMaterial color="#FFF3CF" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Feedback Channels: a speech bubble with three dots. */
function Bubble({ hot }: { hot: boolean }) {
  return (
    <group>
      <mesh scale={[2.4, 1.8, 1]}>
        <sphereGeometry args={[1, 28, 18]} />
        <Gold hot={hot} />
      </mesh>
      <mesh position={[-1.2, -1.75, 0]} rotation={[0, 0, 0.6]}>
        <coneGeometry args={[0.55, 1.4, 12]} />
        <Gold hot={hot} />
      </mesh>
      {[-0.8, 0, 0.8].map((x) => (
        <mesh key={x} position={[x, 0, 1.0]}>
          <sphereGeometry args={[0.26, 12, 8]} />
          <meshBasicMaterial color="#0A1230" />
        </mesh>
      ))}
    </group>
  );
}

const ICONS = [Shield, Pavilion, Ledger, Bubble];

function IconStation({ i, station, active, open, onPick }: { i: number; station: Station; active: boolean; open: boolean; onPick: () => void }) {
  const a = hoggaanStationAngle(i);
  const g = useRef<Group>(null);
  const lang = useStore((s) => s.lang);
  const Icon = ICONS[i] ?? Shield;
  useFrame((s, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * (open ? 0.9 : 0.35);
    g.current.position.y = 7 + Math.sin(s.clock.elapsedTime * 1.3 + i) * 0.35;
    const k = open ? 1.18 : 1;
    g.current.scale.lerp({ x: k, y: k, z: k } as never, 0.12);
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!active || e.delta > 6) return;
    e.stopPropagation();
    onPick();
  };
  return (
    <group position={[Math.cos(a) * 22, 0, Math.sin(a) * 22]}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[2.2, 2.6, 2, 8]} />
        <meshStandardMaterial color="#16264D" metalness={0.5} roughness={0.4} emissive={open ? '#5A4618' : '#000000'} />
      </mesh>
      <mesh position={[0, 2.65, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.3, open ? 0.14 : 0.07, 6, 40]} />
        <meshBasicMaterial color={open ? '#FFFFFF' : GOLD} toneMapped={false} />
      </mesh>
      {open && <pointLight position={[0, 9, 0]} color={GOLD} intensity={320} distance={24} decay={1.6} />}
      <group ref={g} position={[0, 7, 0]} onClick={click}>
        <Icon hot={open} />
        <mesh visible={false}>
          <sphereGeometry args={[4, 8, 6]} />
        </mesh>
      </group>
      {active && (
        <Html position={[0, 12.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
          <button
            type="button"
            tabIndex={-1}
            onClick={onPick}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold backdrop-blur transition ${
              open ? 'scale-110 border-white bg-[#6B5418] text-white' : 'border-[rgba(244,213,141,0.6)] bg-[rgba(20,18,10,0.78)] text-ink hover:border-white'
            }`}
          >
            <span className="font-mono text-[10px] text-hoggaan">{String(i + 1).padStart(2, '0')}</span>
            {station.name[lang]}
          </button>
        </Html>
      )}
    </group>
  );
}

/** The four leadership sections as symbolic 3D objects around the observation deck. */
export function HoggaanIcons({ stations, active, station, onPick }: { stations: Station[]; active: boolean; station: number | null; onPick: (i: number) => void }) {
  return (
    <>
      {stations.slice(0, 4).map((st, i) => (
        <IconStation key={st.id} i={i} station={st} active={active} open={active && station === i} onPick={() => onPick(i)} />
      ))}
    </>
  );
}
