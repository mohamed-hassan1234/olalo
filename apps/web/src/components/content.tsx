'use client';
import { useState } from 'react';
import { verifiedFacts, type Fact, type Milestone, type SiteContent, type WorldId } from '@lattice/shared';
import { useT } from '@/lib/content';
import { cx, Hud, StatusBadge } from './ui';

const WORLD_TEXT: Record<WorldId, string> = { waxbarasho: 'text-primary-soft', midnimo: 'text-midnimo-soft', hoggaan: 'text-hoggaan' };
const WORLD_BORDER: Record<WorldId, string> = { waxbarasho: 'border-primary', midnimo: 'border-midnimo', hoggaan: 'border-hoggaan' };

/** A milestone as a mission card: the seven fields from chapter 13, with its status first. */
export function MilestoneCard({ m, compact }: { m: Milestone; compact?: boolean }) {
  const { l, lang, t } = useT();
  const rows: [string, string][] = [
    [lang === 'so' ? 'Ujeedo' : 'Objective', l(m.objective)],
    [lang === 'so' ? 'Hawl' : 'Activity', l(m.activity)],
    [lang === 'so' ? 'Mas’uul' : 'Responsible', l(m.responsible)],
    [lang === 'so' ? 'Ku xidhan' : 'Depends on', m.dependencies.map((d) => l(d)).join(' · ') || '—'],
    [lang === 'so' ? 'Waqti' : 'Timeline', l(m.timeline)],
    [lang === 'so' ? 'Natiijo' : 'Outcome', l(m.outcome)],
  ];
  return (
    <article className="flex flex-col gap-3 rounded-lg bg-raised p-4" aria-label={l(m.title)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Hud className={WORLD_TEXT[m.world]}>
          #{String(m.order).padStart(2, '0')} · {m.world}
        </Hud>
        <StatusBadge status={m.status} extra={m.approvalBody ? l(m.approvalBody) : undefined} />
      </div>
      <h3 className="font-display text-[19px] leading-6 font-semibold">{l(m.title)}</h3>
      {m.summary && <p className="text-[14px] leading-5 text-ink">{l(m.summary)}</p>}
      {m.placeholder && <span className="font-mono text-[10px] tracking-wide text-amber/90">{t('draftTag')}</span>}
      {!compact && (
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[14px] leading-5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-2">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {m.status === 'completed' && m.evidenceUrl && (
        <a className="text-primary-soft underline" href={m.evidenceUrl} rel="noopener noreferrer" target="_blank">
          Evidence
        </a>
      )}
    </article>
  );
}

/** Accessible list view of the roadmap with a month timeline (also the LITE / reduced-motion default). */
export function RoadmapList({ content, filter = 'all' }: { content: SiteContent; filter?: 'all' | WorldId | 'approval' }) {
  const { t, lang } = useT();
  const items = [...content.milestones]
    .sort((a, b) => a.order - b.order)
    .filter((m) => (filter === 'all' ? true : filter === 'approval' ? m.status === 'requires_approval' : m.world === filter));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-5 text-ink-2">
        {lang === 'so'
          ? 'Hiigsiyada waxay ku taxan yihiin sida waqtiga la filayo ee xilka la qabto kadib. Doorashada ka hor, kaliya "La soo jeediyay" iyo "Oggolaansho" ayaa la muujin karaa.'
          : 'Milestones in order of expected timeline after taking office. Before the election only Proposed and Needs approval can appear.'}
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-panel p-3 text-[13px]">
        <StatusBadge status="proposed" />
        <StatusBadge status="requires_approval" />
        <span className="text-ink-3">
          {t('statusInProgress')} / {t('statusCompleted')}: {lang === 'so' ? 'doorashada kadib' : 'after election only'}
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {items.map((m) => (
          <li key={m.id} className={cx('flex flex-col gap-1 rounded-lg border-l-4 bg-panel p-3', WORLD_BORDER[m.world])}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-semibold">
                {String(m.order).padStart(2, '0')} · {m.title[lang]}
              </span>
              <StatusBadge status={m.status} />
            </div>
            {m.summary && <span className="text-[14px] text-ink">{m.summary[lang]}</span>}
            <span className="text-[13px] text-ink-2">
              {m.world} · {m.timeline[lang]}
              {m.approvalBody ? ` · ${m.approvalBody[lang]}` : ''}
            </span>
          </li>
        ))}
      </ol>
      <span className="font-mono text-[10px] tracking-wide text-amber/90">{t('draftTag')}</span>
    </div>
  );
}

function FactList({ facts }: { facts: Fact[] }) {
  const { t, l } = useT();
  const verified = verifiedFacts(facts);
  if (verified.length) {
    return (
      <ul className="flex flex-col gap-3">
        {verified.map((f, i) => (
          <li key={i} className="flex flex-col gap-1">
            <p className="text-[15px] leading-[22px]">{l(f.text)}</p>
            <span className="text-[12px] text-ink-2">
              Source: {f.source} · Verified by: {f.verifiedBy}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  // Unverified items are never shown as fact: only as a labelled placeholder describing what is missing.
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[#6F7E96] p-3.5">
      <Hud className="text-amber">{t('placeholder')}</Hud>
      {facts.map((f, i) => (
        <p key={i} className="text-[15px] leading-[22px] text-ink-2">
          {l(f.text)}
        </p>
      ))}
    </div>
  );
}

const TABS = ['biography', 'academics', 'experience', 'philosophy', 'activities', 'initiatives'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, { so: string; en: string }> = {
  biography: { so: 'Taariikh', en: 'Biography' },
  academics: { so: 'Waxbarasho', en: 'Academics' },
  experience: { so: 'Khibrad', en: 'Experience' },
  philosophy: { so: 'Mabaadi’', en: 'Philosophy' },
  activities: { so: 'Hawlo', en: 'Activities' },
  initiatives: { so: 'Hindiseyaal', en: 'Initiatives' },
};

export function ProfileContent({ content }: { content: SiteContent }) {
  const { lang, l } = useT();
  const [tab, setTab] = useState<Tab>('biography');
  const c = content.candidate;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex h-56 items-end justify-center overflow-hidden rounded-xl border border-[rgba(127,184,255,0.35)] bg-navy">
        {c.photo.approved && c.photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo.url} alt={l(c.photo.alt)} className="h-full w-full object-cover" />
        ) : (
          <>
            <svg width="190" height="190" viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="78" r="44" fill="#16264D" />
              <path d="M14 200 Q 18 128 100 124 Q 182 128 186 200 Z" fill="#16264D" />
            </svg>
            <span className="absolute top-24 rounded border border-dashed border-[#6F7E96] bg-[rgba(5,7,13,0.6)] px-2 py-1 font-mono text-[11px] tracking-wide text-ink-2">
              [ {l(c.photo.alt)} ]
            </span>
          </>
        )}
      </div>
      <div>
        <h2 className="font-display text-[26px] leading-8 font-semibold">{c.name}</h2>
        <p className="text-[14px] text-ink-2">{l(c.roleLine)}</p>
      </div>
      <div role="tablist" aria-label="Profile sections" className="flex gap-1 overflow-x-auto border-b border-raised">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx('h-11 shrink-0 px-2.5 text-[14px]', tab === k ? 'border-b-2 border-primary font-semibold text-ink' : 'text-ink-2')}
          >
            {TAB_LABEL[k][lang]}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'initiatives' ? <RoadmapList content={content} /> : <FactList facts={c.sections[tab]} />}
      </div>
      <p className="text-[13px] text-ink-2">
        {lang === 'so' ? 'Khalad ma aragtay?' : 'Spotted an error?'} {content.disclosure.correctionsContact}
      </p>
    </div>
  );
}

export function AboutContent({ content }: { content: SiteContent }) {
  const { lang, l } = useT();
  const d = content.disclosure;
  return (
    <div className="flex flex-col gap-4 text-[15px] leading-[22px]">
      <ul className="flex flex-col gap-2">
        <li>{l(d.notOfficial)}</li>
        <li>{l(d.fictionalEnvironments)}</li>
        <li>{l(d.feedbackNotVote)}</li>
      </ul>
      <h3 className="font-display text-[19px] font-semibold">{lang === 'so' ? 'Asturnaanta' : 'Privacy'}</h3>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-ink-2">
        {d.privacy.map((p, i) => (
          <li key={i}>{l(p)}</li>
        ))}
      </ul>
      <h3 className="font-display text-[19px] font-semibold">{lang === 'so' ? 'Su’aalaha' : 'FAQ'}</h3>
      <dl className="flex flex-col gap-3">
        {content.faq.map((f, i) => (
          <div key={i}>
            <dt className="font-semibold">{l(f.q)}</dt>
            <dd className="text-ink-2">{l(f.a)}</dd>
          </div>
        ))}
      </dl>
      {content.launch.status === 'blocked' && (
        <div className="rounded-lg border border-[rgba(242,181,68,0.5)] p-3">
          <Hud className="text-amber">{lang === 'so' ? 'Lama daah-furin · waxaa la sugayaa' : 'Not launched · waiting for'}</Hud>
          <ul className="mt-2 list-disc pl-5 text-[14px] text-ink-2">
            {content.launch.blockers.map((b, i) => (
              <li key={i}>{l(b)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[13px] text-ink-2">
        {lang === 'so' ? 'Codadka iyo muuqaallada waa asal; far: Inter, Space Grotesk, JetBrains Mono (SIL OFL).' : 'Sound and visuals are original; fonts: Inter, Space Grotesk, JetBrains Mono (SIL OFL).'} ·{' '}
        {d.correctionsContact}
      </p>
    </div>
  );
}

/** Text mode: every word of the 3D experience in reading order, no WebGL. */
export function TextContent({ content }: { content: SiteContent }) {
  const { t, l, lang } = useT();
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Hud className="text-primary-soft">{t('faculty')}</Hud>
        <h1 className="font-display text-[34px] leading-10 font-semibold">{t('title')}</h1>
        <p className="text-ink-2">{content.candidate.name} · {t('themes')}</p>
      </header>
      {content.worlds.map((w) => (
        <section key={w.id} id={w.id} aria-labelledby={`h-${w.id}`} className={cx('flex flex-col gap-4 border-l-4 pl-4', WORLD_BORDER[w.id])}>
          <Hud className={WORLD_TEXT[w.id]}>{l(w.theme)}</Hud>
          <h2 id={`h-${w.id}`} className="font-display text-[26px] font-semibold">
            {w.name}
          </h2>
          <p className="text-ink-2">{l(w.tagline)}</p>
          {w.stations.map((s) => {
            const ms = content.milestones.filter((m) => m.world === w.id && m.station === s.id);
            return (
              <div key={s.id} className="flex flex-col gap-2">
                <h3 className="text-[17px] font-semibold">
                  {l(s.name)} · <span className="font-normal text-ink-2">{l(s.subtitle)}</span>
                </h3>
                <p className="text-[15px] text-ink-2">{l(s.body)}</p>
                {ms.map((m) => (
                  <MilestoneCard key={m.id} m={m} compact />
                ))}
              </div>
            );
          })}
        </section>
      ))}
      <section id="roadmap" className="flex flex-col gap-3">
        <h2 className="font-display text-[26px] font-semibold">{t('roadmap')}</h2>
        <RoadmapList content={content} />
      </section>
      <section id="profile" className="flex flex-col gap-3">
        <h2 className="font-display text-[26px] font-semibold">{t('profile')}</h2>
        <ProfileContent content={content} />
      </section>
      <section id="about" className="flex flex-col gap-3">
        <h2 className="font-display text-[26px] font-semibold">{t('about')}</h2>
        <AboutContent content={content} />
      </section>
      <p className="text-[13px] text-ink-3">{lang === 'so' ? 'Nooca qoraalka · isla nuxurka' : 'Text version · same content'}</p>
    </div>
  );
}
