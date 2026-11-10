'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import type { SiteContent } from '@lattice/shared';
import { track } from '@/lib/analytics';
import { QUALITY } from '@/lib/quality';
import { useStore } from '@/lib/store';
import { Awakening } from './Awakening';
import { Bridges } from './Bridges';
import { CameraRig } from './CameraRig';
import { Environment } from './Environment';
import { Nexus } from './Nexus';
import { PerfGuard } from './PerfGuard';
import { Hoggaan } from './worlds/Hoggaan';
import { Midnimo } from './worlds/Midnimo';
import { Waxbarasho } from './worlds/Waxbarasho';

const Effects = lazy(() => import('./Effects'));

export interface Experience3DProps {
  content: SiteContent;
  onContextLost: () => void;
  onReady: () => void;
}

/** The single persistent WebGL canvas (ch. 10). Decorative to assistive tech: every action has an HTML control. */
export default function Experience3D({ content, onContextLost, onReady }: Experience3DProps) {
  const quality = useStore((s) => s.quality);
  const q = QUALITY[quality === 'text' ? 'lite' : quality];
  // Antialiasing is fixed when the GL context is created; quality step-downs must not recreate the canvas
  // (a remount disposes the old context, which previously surfaced as a false '3D unavailable' banner).
  const [antialias] = useState(q.antialias);
  const disposed = useRef(false);
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, []);
  const stationsOf = (id: string) => content.worlds.find((w) => w.id === id)?.stations ?? [];

  useEffect(() => {
    document.documentElement.dataset.quality = quality;
  }, [quality]);

  return (
    <Canvas
      dpr={q.dpr}
      gl={{ antialias, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 30, near: 0.5, far: 2000, position: [6, 62, 14] }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = SRGBColorSpace;
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          if (disposed.current) return; // normal teardown, not a crash
          track('context_lost');
          onContextLost();
        });
        onReady();
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <Environment stars={q.stars} skyline={q.skyline} dust={q.dust} />
      <Nexus pbr={q.pbr} />
      <Bridges />
      <Waxbarasho shards={q.shards} pbr={q.pbr} stations={stationsOf('waxbarasho')} />
      <Midnimo stations={stationsOf('midnimo')} />
      <Hoggaan milestones={content.milestones} stations={stationsOf('hoggaan')} />
      <Awakening />
      <CameraRig flightScale={q.flightScale} />
      <PerfGuard floor={q.fpsFloor} />
      {q.bloom && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
    </Canvas>
  );
}
