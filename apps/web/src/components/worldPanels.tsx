'use client';
import { useEffect, useRef, useState } from 'react';
import type { Milestone, SiteContent, WorldId } from '@lattice/shared';
import { useT } from '@/lib/content';
import { useStore, WORLD_ORDER } from '@/lib/store';
import { Button, cx, Hud, Icon, IconButton, StatusBadge, StatusGlyph } from './ui';

export const WORLD_HEX: Record<WorldId, string> = { waxbarasho: '#2E8BFF', midnimo: '#19D49A', hoggaan: '#F4D58D' };
const WORLD_TEXT: Record<WorldId, string> = { waxbarasho: 'text-primary-soft', midnimo: 'text-midnimo-soft', hoggaan: 'text-hoggaan' };
const READ_AFTER_MS = 1200;

/** Marks a content point as read once it has stayed on screen long enough to be read. */
function useMarkRead(key: string | null) {
  const markRead = useStore((s) => s.markRead);
  useEffect(() => {
    if (!key) return;
    const id = setTimeout(() => markRead(key), READ_AFTER_MS);
    return () => clearTimeout(id);
  }, [key, markRead]);
}

function DraftTag() {
  const { t } = useT();
  return <span className="font-mono text-[10px] tracking-wide text-amber/90">{t('draftTag')}</span>;
}

/** Compact floating card for a selected point: name, one-line subtitle, a short summary, linked milestones. */
function InfoCard({ content, world, index }: { content: SiteContent; world: WorldId; index: number }) {
  const { t, l } = useT();
  const openStation = useStore((s) => s.openStation);
  const light = useStore((s) => s.light);
  const w = content.worlds.find((x) => x.id === world)!;
  const s = w.stations[index]!;
  const n = w.stations.length;
  const ms = content.milestones.filter((m) => m.world === world && m.station === s.id);
  useMarkRead(`station:${world}:${s.id}`);
  const go = (i: number) => {
    openStation(i);
    if (world === 'midnimo') light(w.stations[i]!.id);
  };
  return (
    <section key={s.id} role="dialog" aria-label={l(s.name)} className="glass pointer-events-auto anim-pop w-full max-w-[400px] rounded-2xl p-4" style={{ borderColor: `${WORLD_HEX[world]}88` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Hud className={WORLD_TEXT[world]}>
            {String(index + 1).padStart(2, '0')} · {l(s.name)}
          </Hud>
          <h2 className="font-display text-[20px] leading-6 font-semibold">{l(s.subtitle)}</h2>
        </div>
        <IconButton label={t('close')} onClick={() => openStation(null)} className="shrink-0">
          <Icon.close />
        </IconButton>
      </div>
      <p className="mt-2 text-[15px] leading-[22px] text-ink">{l(s.body)}</p>
      {world === 'midnimo' && <p className="mt-2 text-[12px] text-ink-2">{t('litNote')}</p>}
      {world === 'hoggaan' && s.id === 'ledger' && <p className="mt-2 text-[12px] text-ink-2">{t('trackingNote')}</p>}
      {ms.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-[rgba(127,184,255,0.18)] pt-3">
          {ms.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-[13px]">
              <StatusGlyph status={m.status} />
              <span className="font-semibold">{l(m.title)}</span>
              <span className="ml-auto shrink-0 text-ink-2">{l(m.timeline)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        {s.placeholder && <DraftTag />}
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton label={t('previous')} onClick={() => go((index + n - 1) % n)}>
            <Icon.left />
          </IconButton>
          <span className="w-10 text-center text-[13px] text-ink-2">
            {index + 1}/{n}
          </span>
          <IconButton label={t('next')} onClick={() => go((index + 1) % n)} data-testid="next-station">
            <Icon.right />
          </IconButton>
        </div>
      </div>
    </section>
  );
}

/** Small, keyboard- and screen-reader-friendly rail mirroring the 3D points. */
function StationRail({ content, world }: { content: SiteContent; world: WorldId }) {
  const { l } = useT();
  const station = useStore((s) => s.station);
  const lit = useStore((s) => s.lit);
  const openStation = useStore((s) => s.openStation);
  const light = useStore((s) => s.light);
  const w = content.worlds.find((x) => x.id === world)!;
  return (
    <nav aria-label={w.name} className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
      {w.stations.map((st, i) => {
        const on = station === i;
        return (
          <button
            key={st.id}
            type="button"
            aria-pressed={on}
            data-testid={`station-${st.id}`}
            onClick={() => {
              openStation(i);
              if (world === 'midnimo') light(st.id);
            }}
            className={cx('flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition', on ? 'text-void' : 'bg-[rgba(10,18,48,0.7)] text-ink')}
            style={{ borderColor: WORLD_HEX[world] + (on || lit.includes(st.id) ? '' : '66'), background: on ? WORLD_HEX[world] : undefined }}
          >
            <span className="font-mono text-[10px] opacity-70">{String(i + 1).padStart(2, '0')}</span>
            {l(st.name)}
          </button>
        );
      })}
    </nav>
  );
}

export function WorldPanel({ content }: { content: SiteContent }) {
  const { t, l, lang } = useT();
  const world = useStore((s) => s.world)!;
  const station = useStore((s) => s.station);
  const setOverlay = useStore((s) => s.setOverlay);
  const openWorld = useStore((s) => s.openWorld);
  const nextWorld = WORLD_ORDER[(WORLD_ORDER.indexOf(world) + 1) % 3]!;
  const hint = world === 'waxbarasho' ? t('dragHint') : world === 'midnimo' ? t('tapNode') : t('tapIcon');
  return (
    <div className="mt-auto flex w-full flex-col items-center gap-2.5 lg:items-end">
      {station !== null ? (
        <InfoCard content={content} world={world} index={station} />
      ) : (
        <p className="anim-fade rounded-full bg-[rgba(5,7,13,0.7)] px-3 py-1 text-[13px] text-ink-2">{hint}</p>
      )}
      <StationRail content={content} world={world} />
      <div className="pointer-events-auto flex gap-2">
        {world === 'hoggaan' && (
          <Button className="h-11" onClick={() => setOverlay('roadmap')} data-testid="open-roadmap">
            {lang === 'so' ? 'Fur Khariidadda' : 'Open the Roadmap'} <Icon.arrow />
          </Button>
        )}
        <Button variant="ghost" className="h-11" onClick={() => openWorld(nextWorld)}>
          {t('next')}: {l(content.worlds.find((x) => x.id === nextWorld)!.theme)}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Roadmap mission card
function MissionCard({ m, index, n, dir, onGo }: { m: Milestone; index: number; n: number; dir: number; onGo: (i: number) => void }) {
  const { t, l } = useT();
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  useMarkRead(`milestone:${m.id}`);
  return (
    <article
      aria-label={l(m.title)}
      aria-live="polite"
      className="glass pointer-events-auto relative w-full max-w-[420px] touch-pan-y overflow-hidden rounded-2xl p-5 select-none"
      style={{ transform: `translateX(${dx}px)`, transition: start.current === null ? 'transform 220ms var(--ease-ui)' : 'none', borderColor: `${WORLD_HEX[m.world]}99` }}
      onPointerDown={(e) => {
        start.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => start.current !== null && setDx(Math.max(-120, Math.min(120, e.clientX - start.current)))}
      onPointerUp={() => {
        const d = dx;
        start.current = null;
        setDx(0);
        if (Math.abs(d) > 50) onGo((index + (d < 0 ? 1 : -1) + n) % n);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${WORLD_HEX[m.world]}, transparent)` }} />
      <div key={m.id} className={dir >= 0 ? 'anim-slide-l' : 'anim-slide-r'}>
        <div className="flex items-center justify-between gap-2">
          <Hud className={WORLD_TEXT[m.world]}>
            {String(m.order).padStart(2, '0')} · {m.world}
          </Hud>
          <StatusBadge status={m.status} />
        </div>
        <h2 className="mt-2 font-display text-[22px] leading-7 font-semibold">{l(m.title)}</h2>
        <p className="mt-1.5 text-[15px] leading-[22px] text-ink">{l(m.summary ?? m.objective)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded-full bg-raised px-2.5 py-1">⏱ {l(m.timeline)}</span>
          {m.approvalBody && <span className="rounded-full bg-[rgba(242,181,68,0.14)] px-2.5 py-1 text-amber">{t('needs')}: {l(m.approvalBody)}</span>}
          <span className="rounded-full bg-raised px-2.5 py-1 text-ink-2">
            {t('lead')}: {l(m.responsible)}
          </span>
        </div>
        {m.placeholder && (
          <div className="mt-2">
            <DraftTag />
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <IconButton label={t('previous')} onClick={() => onGo((index + n - 1) % n)}>
          <Icon.left />
        </IconButton>
        <div className="flex flex-1 items-center justify-center gap-1.5" role="tablist" aria-label="Milestones">
          {Array.from({ length: n }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1} / ${n}`}
              onClick={() => onGo(i)}
              className="flex h-6 items-center"
            >
              <span className={cx('block h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-ink' : 'w-1.5 bg-[#4A5B7E]')} />
            </button>
          ))}
        </div>
        <span className="sr-only">
          {index + 1} / {n}
        </span>
        <IconButton label={t('next')} onClick={() => onGo((index + 1) % n)} data-testid="roadmap-next">
          <Icon.right />
        </IconButton>
      </div>
    </article>
  );
}

export function RoadmapRing({ content }: { content: SiteContent }) {
  const index = useStore((s) => s.roadmapIndex);
  const setRoadmap = useStore((s) => s.setRoadmap);
  const sorted = [...content.milestones].sort((a, b) => a.order - b.order);
  const prev = useRef(index);
  const n = sorted.length;
  const forward = (index - prev.current + n) % n <= n / 2;
  const dir = index === prev.current ? 1 : forward ? 1 : -1;
  useEffect(() => {
    prev.current = index;
  }, [index]);
  const m = sorted[index] ?? sorted[0];
  if (!m) return null;
  return (
    <div className="flex w-full flex-col items-center gap-2 lg:items-end">
      <p className="text-[12px] text-ink-2" data-testid="roadmap-pos">
        {index + 1} / {n}
      </p>
      <MissionCard m={m} index={index} n={n} dir={dir} onGo={(i) => setRoadmap({ roadmapIndex: i })} />
    </div>
  );
}
