'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { CylinderGeometry, type Group, type Mesh, type PointLight, Quaternion, Vector3 } from 'three';
import { fx } from './fx';
import { makeArcMaterial, makeGlowMaterial, makeRevealMaterial } from './materials';

const H = 58;
const RB = 8.5;
const RT = 2.8;
const radiusAt = (y: number) => RB + (RT - RB) * (y / H);

/** A thin strip between two points (used for the luminous seams on the monolith's edges). */
function strip(a: Vector3, b: Vector3, r: number) {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new CylinderGeometry(r, r, len, 5, 1, true);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  return { geo, q, mid };
}

/**
 * The Nexus: a tapered monolith with four buttresses, emissive seams on every edge,
 * a crown light and two holographic rings. All geometry is authored procedurally.
 */
export function Nexus({ pbr }: { pbr: boolean }) {
  const seamMat = useMemo(() => makeRevealMaterial('#7FB8FF'), []);
  const ringA = useMemo(() => makeArcMaterial('#7FB8FF', 0.85), []);
  const ringB = useMemo(() => makeArcMaterial('#BFDBFF', 0.6), []);
  const glow = useMemo(() => makeGlowMaterial('#7FB8FF', 0.9), []);
  const ringsRef = useRef<Group>(null);
  const crownRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);

  const seams = useMemo(() => {
    const corners: [number, number][] = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    const edges = corners.map(([x, z]) => strip(new Vector3(x * RB, 0, z * RB), new Vector3(x * RT, H, z * RT), 0.14));
    const bands = [14, 29, 44].map((y) => ({ y, geo: new CylinderGeometry(radiusAt(y) + 0.08, radiusAt(y) + 0.08, 0.32, 4, 1, true) }));
    return { edges, bands };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    seamMat.uniforms.uReveal!.value = fx.seams * (H + 6);
    ringA.uniforms.uReveal!.value = fx.rings;
    ringB.uniforms.uReveal!.value = Math.max(0, fx.rings * 1.25 - 0.25);
    ringA.uniforms.uTime!.value = t;
    ringB.uniforms.uTime!.value = t;
    glow.uniforms.uOpacity!.value = 0.9 * fx.crown;
    if (ringsRef.current) ringsRef.current.rotation.y = t * 0.05;
    if (crownRef.current) {
      crownRef.current.scale.setScalar(0.2 + 0.8 * fx.crown);
      crownRef.current.rotation.y = t * 0.4;
    }
    if (lightRef.current) lightRef.current.intensity = 900 * fx.crown;
  });

  return (
    <group>
      {/* plinth */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[15, 17, 1.2, 4]} />
        <meshStandardMaterial color="#0B1428" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* monolith body */}
      <mesh position={[0, H / 2, 0]}>
        <cylinderGeometry args={[RT, RB, H, 4, 1]} />
        {pbr ? <meshStandardMaterial color="#1B2C52" roughness={0.42} metalness={0.55} /> : <meshLambertMaterial color="#13213F" />}
      </mesh>
      {/* buttresses */}
      {[
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x! * 10.2, 11, z! * 10.2]} rotation={[z! * -0.2, 0, x! * 0.2]}>
          <boxGeometry args={[2.2, 24, 2.2]} />
          {pbr ? <meshStandardMaterial color="#16264D" roughness={0.5} metalness={0.4} /> : <meshLambertMaterial color="#0E1A33" />}
        </mesh>
      ))}
      {/* seams */}
      {seams.edges.map((s, i) => (
        <mesh key={`e${i}`} geometry={s.geo} material={seamMat} position={s.mid} quaternion={s.q} />
      ))}
      {seams.bands.map((b) => (
        <mesh key={`b${b.y}`} geometry={b.geo} material={seamMat} position={[0, b.y, 0]} />
      ))}
      {/* crown */}
      <mesh ref={crownRef} position={[0, H + 3.6, 0]}>
        <octahedronGeometry args={[1.6, 0]} />
        <meshBasicMaterial color="#F2F6FF" toneMapped={false} />
      </mesh>
      <Billboard position={[0, H + 3.6, 0]}>
        <mesh material={glow}>
          <planeGeometry args={[34, 34]} />
        </mesh>
      </Billboard>
      <pointLight ref={lightRef} position={[0, H + 6, 0]} color="#7FB8FF" intensity={0} distance={140} decay={1.6} />
      {/* holographic rings */}
      <group ref={ringsRef}>
        <mesh material={ringA} position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[17, 0.14, 6, 160]} />
        </mesh>
        <mesh material={ringB} position={[0, 35, 0]} rotation={[Math.PI / 2 + 0.14, 0.08, 0]}>
          <torusGeometry args={[21.5, 0.09, 6, 160]} />
        </mesh>
      </group>
    </group>
  );
}
