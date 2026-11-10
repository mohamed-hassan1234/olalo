'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, type InstancedMesh, Object3D, PMREMGenerator, type Points } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeSkyMaterial } from './materials';

/** Deterministic PRNG so the world looks the same on every load. */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function Stars({ count }: { count: number }) {
  const geo = useMemo(() => {
    const r = prng(7);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = r() * Math.PI * 2;
      const v = 0.05 + r() * 0.95;
      const rad = 700;
      pos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * rad;
      pos[i * 3 + 1] = v * rad;
      pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * rad;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#F2F6FF" size={1.6} sizeAttenuation={false} transparent opacity={0.65} fog={false} depthWrite={false} />
    </points>
  );
}

/** Distant citadel silhouettes: instanced towers on a ring, giving scale through fog. */
function Skyline({ count }: { count: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = prng(11);
    const o = new Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.04;
      const rad = 250 + r() * 90;
      const h = 12 + Math.pow(r(), 2.2) * 110;
      const w = 6 + r() * 16;
      o.position.set(Math.cos(a) * rad, h / 2 - 2, Math.sin(a) * rad);
      o.scale.set(w, h, w * (0.6 + r()));
      o.rotation.set(0, a, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#0C1733" />
    </instancedMesh>
  );
}

/** Slowly drifting dust motes near the hub. */
function Dust({ count }: { count: number }) {
  const ref = useRef<Points>(null);
  const geo = useMemo(() => {
    const r = prng(3);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = 10 + r() * 150;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = r() * 70;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    return g;
  }, [count]);
  useFrame((_s, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.01;
      ref.current.position.y = Math.sin(_s.clock.elapsedTime * 0.15) * 1.5;
    }
  });
  if (count === 0) return null;
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#7FB8FF" size={0.35} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

/** Image-based lighting generated procedurally on the GPU (no HDR download), so metals reflect something. */
function ImageLight() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const tex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = tex;
    scene.environmentIntensity = 0.32;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      tex.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function Environment({ stars, skyline, dust }: { stars: number; skyline: number; dust: number }) {
  const sky = useMemo(() => makeSkyMaterial(), []);
  return (
    <>
      <color attach="background" args={[new Color('#05070D')]} />
      <fogExp2 attach="fog" args={['#0A1230', 0.0042]} />
      <ImageLight />
      <hemisphereLight args={['#2A4A8A', '#05070D', 0.6]} />
      <directionalLight position={[-60, 90, 40]} intensity={0.9} color="#9CC4FF" />
      <directionalLight position={[80, 30, -90]} intensity={0.35} color="#F4D58D" />
      <mesh material={sky}>
        <sphereGeometry args={[900, 32, 16]} />
      </mesh>
      <Stars count={stars} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <circleGeometry args={[600, 64]} />
        <meshStandardMaterial color="#070C1A" roughness={0.95} metalness={0.05} />
      </mesh>
      <Skyline count={skyline} />
      <Dust count={dust} />
    </>
  );
}
