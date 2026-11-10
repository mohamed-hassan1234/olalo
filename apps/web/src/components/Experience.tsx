'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { t as tr, type WorldId } from '@lattice/shared';
import { setAnalyticsContext, track } from '@/lib/analytics';
import { setBed, sfx, stopAll } from '@/lib/audio';
import { useContent, useT } from '@/lib/content';
import { detectQuality, prefersReducedMotion } from '@/lib/quality';
import { useStore } from '@/lib/store';
import {
  AboutSheet,
  AwakeningOverlay,
  EntranceOverlay,
  ExitOverlay,
  HubOverlay,
  MenuSheet,
  PreviewRibbon,
  ProfileOverlay,
  RoadmapOverlay,
  SettingsSheet,
  Toasts,
  WorldOverlay,
} from './overlays';
import { FeedbackScreen, VoteCta } from './progress';
import { Button } from './ui';

const Experience3D = dynamic(() => import('@/three/Experience3D'), { ssr: false });

/** Static, WebGL-free entrance backdrop so the first screen paints immediately (ch. 9, Scene 01). */
function EntranceBackdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="eb" cx="0.5" cy="0.38" r="0.8">
          <stop offset="0" stopColor="#13285A" />
          <stop offset="0.5" stopColor="#0A1230" />
          <stop offset="1" stopColor="#05070D" />
        </radialGradient>
        <filter id="ebb" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect width="390" height="844" fill="url(#eb)" />
      <g opacity="0.35" filter="url(#ebb)">
        <polygon points="195,120 172,170 160,560 195,570" fill="#1A2A50" />
        <polygon points="195,120 218,170 230,560 195,570" fill="#0F1B3A" />
        <line x1="195" y1="124" x2="195" y2="566" stroke="#7FB8FF" strokeWidth="4" />
      </g>
      <g fill="#F2F6FF">
        {[
          [40, 120, 0.5],
          [92, 210, 0.4],
          [330, 150, 0.6],
          [360, 260, 0.35],
          [60, 330, 0.4],
          [300, 420, 0.35],
          [24, 470, 0.4],
          [372, 520, 0.4],
          [140, 96, 0.35],
          [250, 80, 0.5],
        ].map(([x, y, o], i) => (
          <circle key={i} cx={x} cy={y} r="1" opacity={o} />
        ))}
      </g>
    </svg>
  );
}

export default function Experience() {
  const content = useContent();
  const { t, lang } = useT();
  const phase = useStore((s) => s.phase);
  const world = useStore((s) => s.world);
  const station = useStore((s) => s.station);
  const overlay = useStore((s) => s.overlay);
  const sound = useStore((s) => s.sound);
  const motion = useStore((s) => s.motion);
  const quality = useStore((s) => s.quality);
  const visited = useStore((s) => s.visited);
  const announce = useStore((s) => s.announce);
  const cta = useStore((s) => s.cta);
  const [ready, setReady] = useState(false);
  const [contextLost, setContextLost] = useState(0);
  const [hubVisits, setHubVisits] = useState(0);
  const [canvasKey, setCanvasKey] = useState(0);
  const swipeX = useRef<number | null>(null);
  const prevVisited = useRef(0);

  // Initial capability detection, preferences and the anonymous page view.
  useEffect(() => {
    const s = useStore.getState();
    const q = detectQuality();
    // A quality the visitor (or a test) explicitly asked for is respected: the frame-rate guard will not override it.
    s.setQuality(q, new URLSearchParams(window.location.search).has('quality'));
    if (prefersReducedMotion()) s.setMotion('reduced');
    try {
      const l = localStorage.getItem('lattice.lang');
      if (l === 'so' || l === 'en') s.setLang(l);
      if (localStorage.getItem('lattice.motion') === 'reduced') s.setMotion('reduced');
    } catch {
      /* storage blocked: defaults apply */
    }
    setAnalyticsContext({ profile: q, lang: useStore.getState().lang });
    track('page_view', { scene: 'entrance' });
    if (q === 'text') track('webgl_unavailable');
    const hash = window.location.hash.replace('#', '');
    if (hash === 'waxbarasho' || hash === 'midnimo' || hash === 'hoggaan') s.face(hash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    setAnalyticsContext({ lang });
    try {
      localStorage.setItem('lattice.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    try {
      localStorage.setItem('lattice.motion', motion);
    } catch {
      /* ignore */
    }
  }, [motion]);

  useEffect(() => setAnalyticsContext({ profile: quality }), [quality]);

  // Phase-driven analytics, announcements and sound.
  useEffect(() => {
    const s = useStore.getState();
    if (phase === 'awakening') track('enter_pressed', { scene: 'awakening' });
    if (phase === 'hub') {
      setHubVisits((v) => v + 1);
      if (hubVisits === 0) track('hub_reached', { scene: 'hub' });
      s.say(lang === 'so' ? 'Xarunta. Dooro adduun.' : 'Central Universe. Choose a world.');
      if (sound) setBed('hub');
    }
    if (phase === 'exit') {
      track('exit_reached', { scene: 'exit', worldsVisited: s.visited.length });
      s.say(lang === 'so' ? 'Dhammaadka.' : 'Exit. The three worlds joined as one lattice.');
      if (sound) sfx.chord();
    }
    if (phase === 'entrance') {
      stopAll();
      setReady(false);
    }
    window.history.replaceState(null, '', phase === 'world' && world ? `#${world}` : window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (!world) return;
    window.history.replaceState(null, '', `#${world}`);
    const s = useStore.getState();
    const isNew = visited.length > prevVisited.current;
    prevVisited.current = visited.length;
    track('world_opened', { scene: 'world', world, ...(isNew ? { worldsVisited: visited.length } : {}) });
    const w = content.worlds.find((x) => x.id === world);
    s.say(`${w?.name ?? world}. ${w?.stations.length ?? 0} ${tr(world === 'midnimo' ? 'platforms' : 'stations', lang)}.`);
    if (sound) {
      sfx.chime(world as WorldId);
      sfx.whoosh(2.2);
      setBed(world);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  useEffect(() => {
    if (!world || station === null) return;
    const w = content.worlds.find((x) => x.id === world);
    const st = w?.stations[station];
    if (st) {
      track('station_opened', { scene: 'world', world, station: st.id });
      useStore.getState().say(st.name[lang]);
    }
    if (sound) sfx.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, world]);

  useEffect(() => {
    if (overlay === 'roadmap') track('roadmap_opened', { scene: 'roadmap' });
    if (overlay === 'profile') track('profile_opened', { scene: 'profile' });
  }, [overlay]);

  useEffect(() => {
    if (!sound) stopAll();
    else if (phase === 'hub') setBed('hub');
    else if (phase === 'world' && world) setBed(world);
  }, [sound, phase, world]);

  // After three content points are read, show the next step once the visitor finishes reading (or after 6 s).
  useEffect(() => {
    if (cta !== 'pending') return;
    const reading = station !== null || overlay === 'roadmap' || overlay === 'profile';
    if (!reading) {
      useStore.getState().setCta('vote');
      return;
    }
    const id = setTimeout(() => useStore.getState().cta === 'pending' && useStore.getState().setCta('vote'), 6000);
    return () => clearTimeout(id);
  }, [cta, station, overlay]);

  // Keyboard: ← → orbit the hub, Escape steps back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (s.phase === 'hub' && !s.overlay) {
        if (e.key === 'ArrowLeft') s.orbit(-1);
        if (e.key === 'ArrowRight') s.orbit(1);
      }
      if (e.key === 'Escape') {
        if (s.overlay) s.setOverlay(null);
        else if (s.station !== null) s.openStation(null);
        else if (s.phase === 'world') s.backToHub();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const no3d = quality === 'text';
  const showCanvas = phase !== 'entrance' && !no3d && contextLost < 2;

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-void select-none"
      onPointerDown={(e) => (swipeX.current = e.clientX)}
      onPointerUp={(e) => {
        const s = useStore.getState();
        if (swipeX.current === null || s.phase !== 'hub' || s.overlay) return;
        const dx = e.clientX - swipeX.current;
        swipeX.current = null;
        if (Math.abs(dx) > 60 && e.pointerType !== 'mouse') s.orbit(dx < 0 ? 1 : -1);
      }}
    >
      <a href="/text/" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-void">
        {t('readWithout3d')}
      </a>
      {phase === 'entrance' && <EntranceBackdrop />}
      {showCanvas && (
        <div className="absolute inset-0" aria-hidden="true">
          <Experience3D
            key={canvasKey}
            content={content}
            onReady={() => setReady(true)}
            onContextLost={() => setContextLost((n) => n + 1)}
          />
        </div>
      )}
      {phase !== 'entrance' && contextLost > 0 && (
        <div className="glass absolute inset-x-4 top-24 z-30 flex flex-col gap-3 rounded-lg p-4" role="alert">
          <p className="font-semibold">{t('no3d')}</p>
          <div className="flex gap-2">
            {contextLost < 2 && (
              <Button onClick={() => setCanvasKey((k) => k + 1)} className="flex-1">
                {t('restore3d')}
              </Button>
            )}
            <a href="/text/" className="flex h-12 flex-1 items-center justify-center rounded-lg border border-[rgba(127,184,255,0.4)]">
              {t('openText')}
            </a>
          </div>
        </div>
      )}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto max-w-[1600px] ${content.launch.status === 'blocked' ? 'top-5' : 'top-0'}`}>
        {phase === 'entrance' && <EntranceOverlay content={content} no3d={no3d} />}
        {phase === 'awakening' && <AwakeningOverlay ready={ready} />}
        {phase === 'hub' && <HubOverlay content={content} firstVisit={hubVisits <= 1} />}
        {phase === 'world' && overlay !== 'roadmap' && <WorldOverlay content={content} />}
        {phase === 'exit' && <ExitOverlay content={content} />}
        {overlay === 'roadmap' && <RoadmapOverlay content={content} inWorld={phase === 'world' && world === 'hoggaan'} />}
        {overlay === 'profile' && <ProfileOverlay content={content} />}
        {overlay === 'menu' && <MenuSheet />}
        {overlay === 'settings' && <SettingsSheet />}
        {overlay === 'about' && <AboutSheet content={content} />}
        {cta === 'vote' && <VoteCta content={content} />}
        {cta === 'feedback' && <FeedbackScreen content={content} />}
        <Toasts />
      </div>
      <PreviewRibbon content={content} />
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>
    </main>
  );
}
