'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { type PerspectiveCamera, Vector3 } from 'three';
import { useStore } from '@/lib/store';
import { exitShot, hubShot, type Shot, worldShot } from '@/lib/shots';

/** Shared target the camera looks at; GSAP tweens it together with the camera position. */
export const lookTarget = new Vector3(0, 60, 0);

export function shotFor(state: ReturnType<typeof useStore.getState>, portrait: boolean): Shot | null {
  if (state.phase === 'hub') return hubShot(state.facing, portrait);
  if (state.phase === 'world' && state.world) return worldShot(state.world, state.station, portrait, state.overlay === 'roadmap');
  if (state.phase === 'exit') return exitShot(portrait);
  return null;
}

/**
 * Crane-and-dolly camera (ch. 11): every move is an eased tween between named shots,
 * never faster than the comfort limits; reduced motion cuts instead of flying.
 */
export function CameraRig({ flightScale }: { flightScale: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const portrait = size.height > size.width;
  const phase = useStore((s) => s.phase);
  const facing = useStore((s) => s.facing);
  const world = useStore((s) => s.world);
  const station = useStore((s) => s.station);
  const overlay = useStore((s) => s.overlay);
  const motion = useStore((s) => s.motion);
  const prev = useRef<{ phase: string; world: string | null }>({ phase, world });
  const pointer = useRef({ x: 0, y: 0 });
  const offset = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    const shot = shotFor(useStore.getState(), portrait);
    if (!shot) return;
    const from = prev.current;
    let duration = 1.0;
    if (phase === 'hub' && from.phase === 'hub') duration = 1.1; // orbit
    else if (phase === 'world' && from.phase !== 'world') duration = 2.4; // the Crossing
    else if (phase === 'world' && from.world !== world) duration = 2.4;
    else if (phase === 'hub' && from.phase === 'world') duration = 2.0;
    else if (phase === 'exit') duration = 3.2;
    else if (phase === 'hub' && from.phase === 'awakening') duration = 0.9;
    prev.current = { phase, world };
    duration *= flightScale;
    const reduced = motion === 'reduced';
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(lookTarget);
    gsap.killTweensOf(camera);
    if (reduced) {
      camera.position.set(...shot.pos);
      lookTarget.set(...shot.target);
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
      return;
    }
    const ease = 'power2.inOut';
    gsap.to(camera.position, { x: shot.pos[0], y: shot.pos[1], z: shot.pos[2], duration, ease });
    gsap.to(lookTarget, { x: shot.target[0], y: shot.target[1], z: shot.target[2], duration: duration * 0.92, ease });
    const crossing = duration >= 2.4 * flightScale && phase === 'world';
    gsap.to(camera, {
      fov: shot.fov,
      duration,
      ease,
      onUpdate: () => camera.updateProjectionMatrix(),
      ...(crossing ? { keyframes: { fov: [camera.fov, shot.fov - 7, shot.fov] } } : {}),
    });
  }, [phase, facing, world, station, overlay, portrait, motion, flightScale, camera]);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const live = motion === 'full' && (phase === 'hub' || phase === 'world' || phase === 'exit');
    offset.set(live ? Math.sin(t * 0.9) * 0.15 + pointer.current.x * 1.2 : 0, live ? Math.sin(t * 0.7) * 0.1 - pointer.current.y * 0.8 : 0, 0);
    camera.lookAt(lookTarget.x + offset.x, lookTarget.y + offset.y, lookTarget.z);
  });
  return null;
}
