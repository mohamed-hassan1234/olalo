'use client';
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import type { PerspectiveCamera } from 'three';
import { track } from '@/lib/analytics';
import { sfx, setBed } from '@/lib/audio';
import { AWAKENING_SHOTS, hubShot } from '@/lib/shots';
import { awakeningControl } from '@/lib/awakeningControl';
import { useStore } from '@/lib/store';
import { lookTarget } from './CameraRig';
import { fx, resetAwakening, setAwakened } from './fx';


/**
 * Scene 02 — System Awakening, rendered in real time (ch. 9 beat sheet, 6.5 s):
 * darkness → first light → Nexus emerges (seams) → rings draw on → three bridges fire → settle on the hub.
 */
export function Awakening() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const phase = useStore((s) => s.phase);

  useEffect(() => {
    if (phase !== 'awakening') return;
    const st = useStore.getState();
    const portrait = size.height > size.width;
    const hub = hubShot(st.facing, portrait);
    let done = false;
    const finish = (skipped: boolean) => {
      if (done) return;
      done = true;
      setAwakened();
      track(skipped ? 'awakening_skipped' : 'awakening_completed');
      useStore.getState().finishAwakening(skipped);
    };

    if (st.motion === 'reduced' || st.quality === 'lite') {
      setAwakened();
      camera.position.set(...hub.pos);
      lookTarget.set(...hub.target);
      camera.fov = hub.fov;
      camera.updateProjectionMatrix();
      const id = setTimeout(() => finish(false), 1200);
      awakeningControl.skip = () => {
        clearTimeout(id);
        finish(true);
      };
      return () => clearTimeout(id);
    }

    resetAwakening();
    const s = AWAKENING_SHOTS;
    camera.position.set(...s.crown.pos);
    lookTarget.set(...s.crown.target);
    camera.fov = s.crown.fov;
    camera.updateProjectionMatrix();
    const sound = st.sound;
    const updateFov = () => camera.updateProjectionMatrix();

    const tl = gsap.timeline({
      onUpdate: () => {
        awakeningControl.progress = tl.progress();
      },
      onComplete: () => finish(false),
    });
    if (sound) tl.call(() => sfx.swell(), [], 0);
    // 0.8–1.4 first light
    tl.to(fx, { crown: 0.55, duration: 0.6, ease: 'power1.out' }, 0.8);
    // 1.4–2.4 dolly back, seams light base → crown over 1.6 s
    tl.to(camera.position, { x: s.reveal.pos[0], y: s.reveal.pos[1], z: s.reveal.pos[2], duration: 1.6, ease: 'power2.inOut' }, 1.2);
    tl.to(lookTarget, { x: s.reveal.target[0], y: s.reveal.target[1], z: s.reveal.target[2], duration: 1.6, ease: 'power2.inOut' }, 1.2);
    tl.to(camera, { fov: s.reveal.fov, duration: 1.6, ease: 'power2.inOut', onUpdate: updateFov }, 1.2);
    tl.to(fx, { seams: 1, duration: 1.6, ease: 'power1.inOut' }, 1.0);
    tl.to(fx, { crown: 1, duration: 0.8 }, 2.2);
    if (sound) [1.2, 1.7, 2.2].forEach((at) => tl.call(() => sfx.tick(), [], at));
    // 2.4–4.2 crane down to the 3/4 view; rings draw on
    tl.to(camera.position, { x: s.crane.pos[0], y: s.crane.pos[1], z: s.crane.pos[2], duration: 1.8, ease: 'power2.inOut' }, 2.4);
    tl.to(lookTarget, { x: s.crane.target[0], y: s.crane.target[1], z: s.crane.target[2], duration: 1.8, ease: 'power2.inOut' }, 2.4);
    tl.to(camera, { fov: s.crane.fov, duration: 1.8, ease: 'power2.inOut', onUpdate: updateFov }, 2.4);
    tl.to(fx, { rings: 1, duration: 1.4, ease: 'power1.inOut' }, 2.6);
    // 4.2–5.6 three bridges fire in sequence
    (['waxbarasho', 'midnimo', 'hoggaan'] as const).forEach((w, i) => {
      tl.to(fx.bridges, { [i]: 1, duration: 0.45, ease: 'power2.out' }, 4.2 + i * 0.35);
      if (sound) tl.call(() => sfx.chime(w), [], 4.2 + i * 0.35);
    });
    tl.to(fx, { worlds: 1, duration: 1.0 }, 4.4);
    // 5.6–6.5 settle on the hub vantage
    tl.to(camera.position, { x: hub.pos[0], y: hub.pos[1], z: hub.pos[2], duration: 0.9, ease: 'power2.inOut' }, 5.6);
    tl.to(lookTarget, { x: hub.target[0], y: hub.target[1], z: hub.target[2], duration: 0.9, ease: 'power2.inOut' }, 5.6);
    tl.to(camera, { fov: hub.fov, duration: 0.9, ease: 'power2.inOut', onUpdate: updateFov }, 5.6);
    if (sound) tl.call(() => setBed('hub'), [], 6.0);

    awakeningControl.skip = () => {
      tl.kill();
      camera.position.set(...hub.pos);
      lookTarget.set(...hub.target);
      camera.fov = hub.fov;
      camera.updateProjectionMatrix();
      finish(true);
    };
    return () => {
      tl.kill();
      awakeningControl.skip = undefined;
    };
  }, [phase, camera, size.height, size.width]);

  return null;
}
