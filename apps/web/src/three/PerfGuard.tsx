'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { fpsBucketFor, t } from '@lattice/shared';
import { track, setAnalyticsContext } from '@/lib/analytics';
import { useStore } from '@/lib/store';

/**
 * Live frame-rate monitor (ch. 23): steps down one quality profile after 3 s below the floor,
 * never steps back up in the same session, and reports one anonymous perf sample.
 */
export function PerfGuard({ floor }: { floor: number }) {
  const frames = useRef(0);
  const windowStart = useRef(0);
  const lowSeconds = useRef(0);
  const warmup = useRef(0);
  const hubFps = useRef<number[]>([]);
  const sent = useRef(false);
  const phase = useStore((s) => s.phase);

  useEffect(() => {
    lowSeconds.current = 0;
    warmup.current = 0;
  }, [floor]);

  useFrame((s) => {
    const now = s.clock.elapsedTime;
    if (windowStart.current === 0) windowStart.current = now;
    frames.current++;
    const span = now - windowStart.current;
    if (span < 1) return;
    const fps = frames.current / span;
    frames.current = 0;
    windowStart.current = now;
    if (document.visibilityState !== 'visible') return;
    warmup.current++;
    const st = useStore.getState();
    if (st.phase === 'hub' && hubFps.current.length < 5) hubFps.current.push(fps);
    if (!sent.current && hubFps.current.length === 5) {
      sent.current = true;
      const avg = hubFps.current.reduce((a, b) => a + b, 0) / 5;
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      track('perf_sample', {
        fps: fpsBucketFor(avg),
        ...(paint ? { fcpMs: Math.round(paint.startTime) } : {}),
        ...(st.hubAt !== null && st.enteredAt !== null ? { hubMs: Math.round(st.hubAt - st.enteredAt) } : {}),
      });
    }
    if (warmup.current < 4 || st.phase === 'awakening') return;
    lowSeconds.current = fps < floor ? lowSeconds.current + 1 : 0;
    if (lowSeconds.current >= 3) {
      lowSeconds.current = 0;
      warmup.current = 0;
      const next = st.stepDownQuality();
      if (next) {
        setAnalyticsContext({ profile: next });
        track('quality_downgraded');
        st.toast({ text: t('lighterMode', st.lang) });
      }
    }
  });
  void phase;
  return null;
}
