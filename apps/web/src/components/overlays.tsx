'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { feedbackSchema, type FeedbackAnswer, type SiteContent, type WorldId } from '@lattice/shared';
import { track } from '@/lib/analytics';
import { useT } from '@/lib/content';
import { API_URL } from '@/lib/env';
import { useStore, WORLD_ORDER } from '@/lib/store';
import { awakeningControl } from '@/lib/awakeningControl';
import { AboutContent, ProfileContent, RoadmapList } from './content';
import { Button, cx, Hud, Icon, IconButton, Sheet } from './ui';
import { RoadmapRing, WorldPanel } from './worldPanels';

const WORLD_HEX: Record<WorldId, string> = { waxbarasho: '#2E8BFF', midnimo: '#19D49A', hoggaan: '#F4D58D' };
const WORLD_TEXT: Record<WorldId, string> = { waxbarasho: 'text-primary-soft', midnimo: 'text-midnimo-soft', hoggaan: 'text-hoggaan' };

function SoundToggle() {
  const sound = useStore((s) => s.sound);
  const setSound = useStore((s) => s.setSound);
  const { t } = useT();
  return (
    <IconButton label={sound ? t('soundOn') : t('soundOff')} aria-pressed={sound} onClick={() => setSound(!sound)}>
      {sound ? <Icon.soundOn /> : <Icon.soundOff />}
    </IconButton>
  );
}

// ---------------------------------------------------------------- Scene 01
export function EntranceOverlay({ content, no3d }: { content: SiteContent; no3d: boolean }) {
  const { t, l } = useT();
  const enter = useStore((s) => s.enter);
  const setOverlay = useStore((s) => s.setOverlay);
  const photo = content.candidate.photo;
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col px-4 pt-4 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-[#6F7E96] text-center font-mono text-[9px] leading-[10px] text-ink-2" title="Logo use pending permission">
            LOGO
            <br />
            TBC
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] leading-4 font-semibold">{t('university')}</span>
            <span className="text-[12px] leading-4 text-ink-2">{t('faculty')}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <SoundToggle />
          <IconButton label={t('settings')} onClick={() => setOverlay('settings')}>
            <Icon.gear />
          </IconButton>
        </div>
      </div>
      <div className="relative mx-auto mt-[6vh] flex h-[216px] w-[216px] items-center justify-center" aria-hidden={!photo.approved}>
        <div className="absolute inset-[-14px] rounded-full border border-dashed border-[rgba(127,184,255,0.5)]" />
        <div className="absolute inset-0 rounded-full border-[1.5px] border-primary-soft shadow-[0_0_24px_rgba(46,139,255,0.45)]" />
        <div className="relative h-[200px] w-[200px] overflow-hidden rounded-full bg-panel">
          {photo.approved && photo.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt={l(photo.alt)} className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
              <circle cx="100" cy="82" r="34" fill="#16264D" />
              <path d="M30 178 Q 33 122 100 118 Q 167 122 170 178 Z" fill="#16264D" />
            </svg>
          )}
        </div>
        <svg className="anim-glyph absolute -top-2 -right-6 opacity-60" width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">
          <path d="M8 14 Q 8 2 20 2 Q 32 2 32 13 Q 32 22 21 26 L 21 36" fill="none" stroke="#7FB8FF" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="21" cy="46" r="3" fill="#7FB8FF" />
        </svg>
      </div>
      {!photo.approved && (
        <span className="mx-auto mt-4 rounded border border-dashed border-[#6F7E96] px-2.5 py-1 font-mono text-[11px] tracking-wide text-ink-2">
          [ {l(photo.alt)} ]
        </span>
      )}
      <div className="mt-auto flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-center">
          <Hud className="text-primary-soft">{content.candidate.name}</Hud>
          <h1 className="font-display text-[34px] leading-[40px] font-semibold tracking-tight sm:text-[48px] sm:leading-[54px]">{t('title')}</h1>
          <p className="text-[16px] text-ink-2">{t('themes')}</p>
        </div>
        {no3d ? (
          <div className="glass flex flex-col gap-3 rounded-lg p-4" role="alert" data-testid="no3d">
            <p className="font-semibold">{t('no3d')}</p>
            <p className="text-[14px] text-ink-2">{t('no3dBody')}</p>
            <Link href="/text/" className="flex h-12 items-center justify-center rounded-lg bg-primary-strong font-semibold text-white">
              {t('openText')}
            </Link>
          </div>
        ) : (
          <Button size="lg" className="w-full uppercase sm:mx-auto sm:max-w-md" onClick={enter} data-testid="enter">
            {t('enter')}
          </Button>
        )}
        <Link href="/text/" className="mx-auto flex min-h-11 items-center text-[15px] text-primary-soft underline underline-offset-4">
          {t('readWithout3d')}
        </Link>
        <p className="text-center text-[12px] leading-4 text-ink-3">{l(content.disclosure.notOfficial)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Scene 02
const BEATS = [
  { at: 0, so: 'MUGDI', en: 'DARKNESS' },
  { at: 0.12, so: 'IFTIINKA KOWAAD', en: 'FIRST LIGHT' },
  { at: 0.22, so: 'NEXUS-KA OO SOO BAXAYA', en: 'NEXUS EMERGES' },
  { at: 0.37, so: 'GIRAANTA OO SHIDMAYSA', en: 'RINGS ACTIVATE' },
  { at: 0.65, so: 'BUUNDOOYINKA', en: 'BRIDGES FIRE' },
];
export function AwakeningOverlay({ ready }: { ready: boolean }) {
  const { t, lang } = useT();
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setP(awakeningControl.progress);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const beatIndex = BEATS.reduce((acc, b, i) => (p >= b.at ? i : acc), 0);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
      <div className="flex flex-col gap-1">
        <Hud className="text-primary-soft">
          {lang === 'so' ? 'KICINTA NIDAAMKA' : 'SYSTEM AWAKENING'} · {String(beatIndex + 1).padStart(2, '0')} / 05
        </Hud>
        <Hud className="text-ink-2">{BEATS[beatIndex]![lang]}</Hud>
        {!ready && <Hud className="text-ink-2">{t('preparing')}</Hud>}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="h-0.5 flex-1 rounded bg-raised" aria-hidden="true">
          <div className="h-0.5 rounded bg-primary-soft" style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
        <button
          type="button"
          data-testid="skip"
          onClick={() => awakeningControl.skip?.()}
          className="glass pointer-events-auto flex h-11 min-w-24 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-medium"
        >
          {t('skip')} <Icon.skip />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Top bar shared by hub and worlds
function TopBar({ left, center }: { left: React.ReactNode; center: React.ReactNode }) {
  const setOverlay = useStore((s) => s.setOverlay);
  const { t } = useT();
  return (
    <div className="pointer-events-auto flex items-center justify-between gap-2">
      {left}
      <div className="flex flex-col items-center gap-1">{center}</div>
      <div className="flex gap-1">
        <SoundToggle />
        <IconButton label={t('menu')} onClick={() => setOverlay('menu')} data-testid="menu">
          <Icon.menu />
        </IconButton>
      </div>
    </div>
  );
}

function VisitedDots() {
  const visited = useStore((s) => s.visited);
  const { t } = useT();
  return (
    <>
      <div className="flex gap-1.5" aria-hidden="true">
        {WORLD_ORDER.map((w) => (
          <span key={w} className="h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: WORLD_HEX[w], background: visited.includes(w) ? WORLD_HEX[w] : 'transparent' }} />
        ))}
      </div>
      <Hud className="text-[11px] text-ink-2">
        {visited.length} / 3 {t('visited')}
      </Hud>
    </>
  );
}

// ---------------------------------------------------------------- Scene 03
export function HubOverlay({ content, firstVisit }: { content: SiteContent; firstVisit: boolean }) {
  const { t, l } = useT();
  const facing = useStore((s) => s.facing);
  const orbit = useStore((s) => s.orbit);
  const openWorld = useStore((s) => s.openWorld);
  const setOverlay = useStore((s) => s.setOverlay);
  const w = content.worlds.find((x) => x.id === facing)!;
  const i = WORLD_ORDER.indexOf(facing);
  const prev = content.worlds.find((x) => x.id === WORLD_ORDER[(i + 2) % 3])!;
  const next = content.worlds.find((x) => x.id === WORLD_ORDER[(i + 1) % 3])!;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      <TopBar
        left={
          <IconButton label={t('about')} onClick={() => setOverlay('about')}>
            <Icon.info />
          </IconButton>
        }
        center={<VisitedDots />}
      />
      <div className="flex flex-1 items-center justify-between">
        <IconButton label={`${t('previous')}: ${prev.name}`} onClick={() => orbit(-1)} className="pointer-events-auto" style={{ borderColor: WORLD_HEX[prev.id], color: WORLD_HEX[prev.id] }} data-testid="orbit-prev">
          <Icon.left />
        </IconButton>
        <IconButton label={`${t('next')}: ${next.name}`} onClick={() => orbit(1)} className="pointer-events-auto" style={{ borderColor: WORLD_HEX[next.id], color: WORLD_HEX[next.id] }} data-testid="orbit-next">
          <Icon.right />
        </IconButton>
      </div>
      <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2.5 lg:mx-0 lg:ml-auto">
        {firstVisit && <p className="mx-auto rounded-full bg-[rgba(5,7,13,0.7)] px-3 py-1 text-[13px] text-ink-2">{t('tapToEnter')}</p>}
        <div key={facing} className="glass anim-rise relative flex flex-col gap-2.5 rounded-lg py-4 pr-4 pl-5">
          <span className="absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded" style={{ background: WORLD_HEX[w.id] }} />
          <div className="flex justify-between">
            <Hud className={WORLD_TEXT[w.id]}>
              {String(i + 1).padStart(2, '0')} · {l(w.theme)}
            </Hud>
            <Hud className="text-ink-2">
              {w.stations.length} {w.id === 'midnimo' ? t('platforms') : t('stations')}
            </Hud>
          </div>
          <h2 className="font-display text-[28px] leading-[34px] font-semibold">{w.name}</h2>
          <p className="text-[15px] leading-[22px] text-ink-2">{l(w.tagline)}</p>
          <Button className="w-full font-display font-semibold" onClick={() => openWorld(w.id)} data-testid={`enter-${w.id}`}>
            {t('enterWorld')} {w.name} <Icon.arrow />
          </Button>
        </div>
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {WORLD_ORDER.map((x) => (
            <span key={x} className="h-[3px] rounded" style={{ width: x === facing ? 24 : 12, background: x === facing ? WORLD_HEX[x] : `${WORLD_HEX[x]}55` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Scenes 04–06
export function WorldOverlay({ content }: { content: SiteContent }) {
  const { t, l } = useT();
  const world = useStore((s) => s.world)!;
  const station = useStore((s) => s.station);
  const lit = useStore((s) => s.lit);
  const backToHub = useStore((s) => s.backToHub);
  const w = content.worlds.find((x) => x.id === world)!;
  const n = w.stations.length;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      <TopBar
        left={
          <button type="button" onClick={backToHub} className="glass flex h-11 items-center gap-1.5 rounded-full pr-3.5 pl-2.5 text-[14px]" data-testid="back-hub">
            <Icon.left /> {t('hub')}
          </button>
        }
        center={
          <Hud className={cx('rounded bg-[rgba(5,7,13,0.7)] px-2 py-1', WORLD_TEXT[world])}>
            {w.name}
            {world === 'midnimo' ? ` · ${lit.length} / ${n} lit` : station !== null ? ` · ${station + 1} / ${n}` : ''}
          </Hud>
        }
      />
      <div className="mt-3 flex flex-col gap-0.5">
        <h1 className="font-display text-[28px] leading-[34px] font-semibold">{w.name}</h1>
        <span className="text-[14px] text-ink-2">{l(w.theme)} · {l(w.tagline)}</span>
      </div>
      <WorldPanel content={content} />
    </div>
  );
}

// ---------------------------------------------------------------- Scene 07
export function RoadmapOverlay({ content, inWorld }: { content: SiteContent; inWorld: boolean }) {
  const { t, lang } = useT();
  const view = useStore((s) => s.roadmapView);
  const filter = useStore((s) => s.roadmapFilter);
  const setRoadmap = useStore((s) => s.setRoadmap);
  const setOverlay = useStore((s) => s.setOverlay);
  const motion = useStore((s) => s.motion);
  const quality = useStore((s) => s.quality);
  const sorted = [...content.milestones].sort((a, b) => a.order - b.order);
  const listOnly = !inWorld || motion === 'reduced' || quality === 'lite';
  const effectiveView = listOnly ? 'list' : view;
  const n = sorted.length;
  const filters: { id: typeof filter; label: string }[] = [
    { id: 'all', label: `${lang === 'so' ? 'Dhammaan' : 'All'} · ${n}` },
    { id: 'waxbarasho', label: 'Waxbarasho' },
    { id: 'midnimo', label: 'Midnimo' },
    { id: 'hoggaan', label: 'Hoggaan' },
    { id: 'approval', label: t('statusRequiresApproval') },
  ];

  const Filters = (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter">
      {filters.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={filter === f.id}
          onClick={() => setRoadmap({ roadmapFilter: f.id })}
          className={cx('h-9 shrink-0 rounded-full px-3 text-[13px]', filter === f.id ? 'bg-ink font-semibold text-void' : 'border border-[rgba(127,184,255,0.45)]')}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  if (effectiveView === 'list') {
    return (
      <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-[rgba(5,7,13,0.94)] p-4 anim-fade" role="dialog" aria-label={t('roadmap')}>
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <div className="flex items-center justify-between">
            {inWorld && !listOnly ? (
              <button type="button" onClick={() => setRoadmap({ roadmapView: 'ring' })} className="glass flex h-11 items-center gap-1.5 rounded-full pr-3.5 pl-2.5 text-[14px]">
                <Icon.left /> {t('ringView')}
              </button>
            ) : (
              <span />
            )}
            <IconButton label={t('close')} onClick={() => setOverlay(null)} data-testid="close-roadmap">
              <Icon.close />
            </IconButton>
          </div>
          <h1 className="font-display text-[28px] font-semibold">{t('roadmap')}</h1>
          {Filters}
          <RoadmapList content={content} filter={filter} />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      <div className="pointer-events-auto flex items-center justify-between">
        <button type="button" onClick={() => setOverlay(null)} className="glass flex h-11 items-center gap-1.5 rounded-full pr-3.5 pl-2.5 text-[14px]">
          <Icon.left /> Hoggaan
        </button>
        <button type="button" onClick={() => setRoadmap({ roadmapView: 'list' })} className="glass flex h-11 items-center gap-2 rounded-full px-3.5 text-[14px]" data-testid="roadmap-list">
          <Icon.list /> {t('listView')}
        </button>
      </div>
      <div className="pointer-events-auto mt-3">{Filters}</div>
      <div className="mt-auto flex flex-col items-center gap-2 lg:items-end">
        <Hud className="text-ink-2">‹ {t('swipeHint')} ›</Hud>
        <RoadmapRing content={content} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Scene 08
export function ProfileOverlay({ content }: { content: SiteContent }) {
  const { t } = useT();
  const setOverlay = useStore((s) => s.setOverlay);
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-[rgba(5,7,13,0.7)] p-4 anim-fade" role="dialog" aria-label={t('profile')}>
      <div className="glass mx-auto flex max-w-xl flex-col gap-4 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <Hud className="text-primary-soft">{t('profile')}</Hud>
          <IconButton label={t('close')} onClick={() => setOverlay(null)} data-testid="close-profile">
            <Icon.close />
          </IconButton>
        </div>
        <ProfileContent content={content} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Scene 09
function sessionId(): string {
  try {
    let id = sessionStorage.getItem('lattice.fb');
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      sessionStorage.setItem('lattice.fb', id);
    }
    return id;
  } catch {
    return 'anonymous-session-' + Math.random().toString(36).slice(2, 10);
  }
}

export function FeedbackCard({ content }: { content: SiteContent }) {
  const { t, l, lang } = useT();
  const setFeedback = useStore((s) => s.setFeedback);
  const quality = useStore((s) => s.quality);
  const [state, setState] = useState<'prompt' | 'ask' | 'sending' | 'done' | 'error'>('prompt');
  const [answer, setAnswer] = useState<FeedbackAnswer | null>(null);
  const [comment, setComment] = useState('');
  const [hp, setHp] = useState('');

  useEffect(() => {
    if (state !== 'done') return;
    const id = setTimeout(() => setFeedback('done'), 4000);
    return () => clearTimeout(id);
  }, [state, setFeedback]);

  if (state === 'prompt') {
    return (
      <div className="glass pointer-events-auto anim-rise flex items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-3.5" role="region" aria-label={t('feedbackQuestion')} data-testid="feedback">
        <span className="flex-1 text-[13px] leading-[18px]">{lang === 'so' ? 'Ikhtiyaari: ma caddaa bogga?' : 'Optional: was this site clear?'}</span>
        <button type="button" className="h-11 rounded-lg bg-primary-strong px-3 text-[14px] font-semibold text-white" onClick={() => setState('ask')} data-testid="fb-open">
          {lang === 'so' ? 'Jawaab' : 'Answer'}
        </button>
        <button type="button" className="h-11 px-2 text-[13px] text-ink-2" onClick={() => setFeedback('done')}>
          {t('notNow')}
        </button>
      </div>
    );
  }

  const send = async () => {
    if (!answer) return;
    setState('sending');
    const body = { answer, lang, profile: quality, session: sessionId(), ...(comment.trim() ? { comment: comment.trim() } : {}), ...(hp ? { website: hp } : {}) };
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success || !API_URL) {
      setState(API_URL ? 'error' : 'done');
      return;
    }
    try {
      const r = await fetch(`${API_URL}/v1/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      setState(r.ok || r.status === 409 ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="glass pointer-events-auto anim-rise flex flex-col gap-3 rounded-xl p-4" role="region" aria-label={t('feedbackQuestion')} data-testid="feedback">
      {state === 'done' ? (
        <div className="flex flex-col items-start gap-2">
          <p className="font-display text-[20px] font-semibold">{t('thanks')}</p>
          <p className="text-[14px] text-ink-2">{t('thanksBody')}</p>
          <Button variant="ghost" onClick={() => setFeedback('done')}>
            {t('close')}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Hud className="text-primary-soft">{lang === 'so' ? 'IKHTIYAARI · 1 SU’AAL' : 'OPTIONAL · 1 QUESTION'}</Hud>
            <button type="button" className="min-h-11 px-2 text-[14px] text-ink-2" onClick={() => setFeedback('done')}>
              {t('notNow')}
            </button>
          </div>
          <p className="rounded-md bg-raised px-2.5 py-2 text-[13px] text-ink-2">{l(content.disclosure.feedbackNotVote)}</p>
          <p className="font-display text-[19px] leading-[26px] font-semibold">{t('feedbackQuestion')}</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('feedbackQuestion')}>
            {(['haa', 'qayb', 'maya'] as FeedbackAnswer[]).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={answer === a}
                onClick={() => setAnswer(a)}
                className={cx('h-12 rounded-lg border text-[15px] font-semibold', answer === a ? 'border-primary bg-primary-strong text-white' : 'border-[rgba(127,184,255,0.45)] bg-raised')}
                data-testid={`fb-${a}`}
              >
                {a === 'haa' ? t('feedbackHaa') : a === 'qayb' ? t('feedbackQayb') : t('feedbackMaya')}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
            {t('feedbackComment')}
            <textarea
              rows={2}
              maxLength={280}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="resize-none rounded-lg border border-line bg-navy p-2.5 text-[15px] text-ink"
            />
          </label>
          <label className="sr-only" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
          {state === 'error' && <p className="text-[13px] text-error">{t('sendFailed')}</p>}
          <Button disabled={!answer || state === 'sending'} onClick={send} data-testid="fb-send">
            {t('feedbackSend')}
          </Button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Scene 10
export function ExitOverlay({ content }: { content: SiteContent }) {
  const { t, l, lang } = useT();
  const openWorld = useStore((s) => s.openWorld);
  const restart = useStore((s) => s.restart);
  const answered = useStore((s) => s.feedback === 'done');
  const setCta = useStore((s) => s.setCta);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    track('share_used');
    const url = window.location.origin + '/';
    try {
      if (navigator.share) await navigator.share({ title: t('title'), url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* user cancelled */
    }
  };
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      <div className="mt-12 flex flex-col items-center gap-1 text-center anim-fade">
        <span className="font-display text-[22px] font-semibold tracking-wide">{t('themes')}</span>
        <Hud className="text-ink-2">
          {content.candidate.name} · {t('faculty')}
        </Hud>
      </div>
      <div className="glass pointer-events-auto mt-auto flex flex-col gap-3 rounded-xl p-4 lg:mx-auto lg:w-[460px]">
        <Hud className="text-ink-2">{t('revisit')}</Hud>
        <div className="grid grid-cols-3 gap-2">
          {content.worlds.map((w) => (
            <button key={w.id} type="button" onClick={() => openWorld(w.id)} className="h-12 rounded-lg border text-[13px] font-semibold" style={{ borderColor: WORLD_HEX[w.id] }}>
              {w.name}
            </button>
          ))}
        </div>
        {content.manifesto.available && content.manifesto.url ? (
          <a
            href={content.manifesto.url}
            onClick={() => track('manifesto_opened')}
            className="flex h-13 items-center justify-center gap-2 rounded-lg bg-primary-strong py-3.5 font-semibold text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon.doc /> {t('manifesto')} · PDF{content.manifesto.sizeLabel ? `, ${content.manifesto.sizeLabel}` : ''}
          </a>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#6F7E96] py-3 text-[14px] text-ink-2">
            <Icon.doc /> {t('manifestoUnavailable')}
          </div>
        )}
        {!answered && (
          <Button variant="ghost" onClick={() => setCta('feedback')} data-testid="exit-feedback">
            {t('giveFeedback')}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={share}>
            <Icon.link /> {copied ? t('copied') : t('share')}
          </Button>
          <Button variant="ghost" onClick={restart} data-testid="exit-restart">
            {t('exit')}
          </Button>
        </div>
        <p className="text-center text-[12px] text-ink-2">
          {lang === 'so' ? 'La wadaagistu waxay dirtaa xidhiidhka iyo cinwaanka oo kaliya.' : 'Share sends only the link and title. No pre-written message, no counts.'}
        </p>
        <p className="sr-only">{l(content.disclosure.notOfficial)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Menu, settings, about
export function MenuSheet() {
  const { t, lang } = useT();
  const setOverlay = useStore((s) => s.setOverlay);
  const openWorld = useStore((s) => s.openWorld);
  const setRoadmap = useStore((s) => s.setRoadmap);
  const goExit = useStore((s) => s.goExit);
  const item = 'flex h-14 items-center justify-between rounded-lg bg-raised px-4 text-[16px] font-medium';
  return (
    <Sheet label={t('menu')} onClose={() => setOverlay(null)}>
      <Hud className="text-primary-soft">{t('menu')}</Hud>
      <nav className="mt-2 flex flex-col gap-2">
        <button type="button" className={item} onClick={() => setOverlay('profile')} data-testid="menu-profile">
          {t('profile')} <Icon.right />
        </button>
        <button
          type="button"
          className={item}
          onClick={() => {
            openWorld('hoggaan');
            setRoadmap({ roadmapView: 'ring' });
            setTimeout(() => useStore.getState().setOverlay('roadmap'), 0);
          }}
          data-testid="menu-roadmap"
        >
          {t('roadmap')} <Icon.right />
        </button>
        <button type="button" className={item} onClick={() => setOverlay('settings')}>
          {t('settings')} <Icon.right />
        </button>
        <button type="button" className={item} onClick={() => setOverlay('about')}>
          {t('about')} <Icon.right />
        </button>
        <Link href="/text/" className={item}>
          {t('readWithout3d')} <Icon.right />
        </Link>
        <button type="button" className={cx(item, 'border border-[rgba(127,184,255,0.35)] bg-transparent')} onClick={goExit} data-testid="menu-exit">
          {lang === 'so' ? 'Dhammee sahminta' : 'Finish exploring'} <Icon.right />
        </button>
      </nav>
    </Sheet>
  );
}

export function SettingsSheet() {
  const { t, lang } = useT();
  const s = useStore();
  const seg = (active: boolean) => cx('h-10 flex-1 rounded-md text-[14px]', active ? 'bg-raised font-semibold text-ink' : 'text-ink-2');
  return (
    <Sheet label={t('settings')} onClose={() => s.setOverlay(null)}>
      <Hud className="text-primary-soft">{t('settings')}</Hud>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] text-ink-2">{t('motion')}</legend>
        <div className="flex gap-1 rounded-lg bg-panel p-1">
          <button type="button" aria-pressed={s.motion === 'full'} className={seg(s.motion === 'full')} onClick={() => s.setMotion('full')}>
            {t('motionFull')}
          </button>
          <button type="button" aria-pressed={s.motion === 'reduced'} className={seg(s.motion === 'reduced')} onClick={() => s.setMotion('reduced')} data-testid="motion-reduced">
            {t('motionReduced')}
          </button>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] text-ink-2">
          {t('quality')} · {s.quality}
        </legend>
        <div className="flex gap-1 rounded-lg bg-panel p-1">
          {(['high', 'balanced', 'lite'] as const).map((q) => (
            <button key={q} type="button" aria-pressed={s.quality === q} className={seg(s.quality === q)} onClick={() => s.setQuality(q, true)}>
              {q === 'high' ? 'High' : q === 'balanced' ? 'Balanced' : 'Lite'}
            </button>
          ))}
          <Link href="/text/" className={cx(seg(false), 'flex items-center justify-center')}>
            Text
          </Link>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] text-ink-2">{t('language')}</legend>
        <div className="flex gap-1 rounded-lg bg-panel p-1">
          <button type="button" aria-pressed={lang === 'so'} className={seg(lang === 'so')} onClick={() => s.setLang('so')} data-testid="lang-so">
            Soomaali
          </button>
          <button type="button" aria-pressed={lang === 'en'} className={seg(lang === 'en')} onClick={() => s.setLang('en')} data-testid="lang-en">
            English
          </button>
        </div>
      </fieldset>
      <div className="flex items-center justify-between">
        <span className="text-[14px]">{t('sound')}</span>
        <SoundToggle />
      </div>
    </Sheet>
  );
}

export function AboutSheet({ content }: { content: SiteContent }) {
  const { t } = useT();
  const setOverlay = useStore((s) => s.setOverlay);
  return (
    <Sheet label={t('about')} onClose={() => setOverlay(null)} tall>
      <Hud className="text-primary-soft">{t('about')}</Hud>
      <AboutContent content={content} />
    </Sheet>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none absolute inset-x-4 top-20 z-30 flex flex-col items-center gap-2" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className="pointer-events-auto flex items-center gap-3 rounded-lg border border-[rgba(127,184,255,0.35)] bg-raised px-3.5 py-2.5 text-[14px] anim-rise">
          {x.text}
          <button type="button" className="min-h-11 px-2 text-primary-soft" onClick={() => dismiss(x.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function PreviewRibbon({ content, inline }: { content: SiteContent; inline?: boolean }) {
  const { t } = useT();
  if (content.launch.status !== 'blocked') return null;
  return (
    <div
      className={cx('z-40 h-5 w-full bg-amber text-center font-mono text-[10px] leading-5 tracking-wider text-void', inline ? 'relative' : 'pointer-events-none absolute inset-x-0 top-0')}
      role="note"
    >
      {t('previewRibbon')}
    </div>
  );
}

