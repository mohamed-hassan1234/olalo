'use client';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import type { SiteContent } from '@lattice/shared';
import { track } from '@/lib/analytics';
import { useContent, useT } from '@/lib/content';
import { useStore } from '@/lib/store';
import { AboutContent, ProfileContent, RoadmapList, TextContent } from './content';
import { PreviewRibbon } from './overlays';

/** Plain, fully static page frame used by text mode and the shareable /profile, /roadmap and /about pages. */
function Shell({ children, content }: { children: ReactNode; content: SiteContent }) {
  const { t, lang } = useT();
  const setLang = useStore((s) => s.setLang);
  useEffect(() => {
    try {
      const l = localStorage.getItem('lattice.lang');
      if (l === 'so' || l === 'en') setLang(l);
    } catch {
      /* ignore */
    }
  }, [setLang]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <div className="min-h-screen bg-void">
      <PreviewRibbon content={content} inline />
      <header className="sticky top-0 z-10 border-b border-raised bg-navy/95 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <Link href="/" className="font-display font-semibold">
            {t('title')}
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-[14px]" aria-label="Pages">
            <Link className="rounded px-2 py-2" href="/text/">
              Text
            </Link>
            <Link className="rounded px-2 py-2" href="/profile/">
              {t('profile')}
            </Link>
            <Link className="rounded px-2 py-2" href="/roadmap/">
              {t('roadmap')}
            </Link>
            <Link className="rounded px-2 py-2" href="/about/">
              {t('about')}
            </Link>
            <button
              type="button"
              className="min-h-11 rounded border border-line px-2.5"
              onClick={() => {
                const next = lang === 'so' ? 'en' : 'so';
                setLang(next);
                try {
                  localStorage.setItem('lattice.lang', next);
                } catch {
                  /* ignore */
                }
              }}
            >
              {lang === 'so' ? 'English' : 'Soomaali'}
            </button>
            <Link className="rounded bg-primary-strong px-3 py-2 font-semibold text-white" href="/">
              {t('try3d')}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

export function TextPage() {
  const content = useContent();
  useEffect(() => track('text_mode_opened', { scene: 'text' }), []);
  return (
    <Shell content={content}>
      <TextContent content={content} />
    </Shell>
  );
}
export function ProfilePage() {
  const content = useContent();
  return (
    <Shell content={content}>
      <ProfileContent content={content} />
    </Shell>
  );
}
export function RoadmapPage() {
  const content = useContent();
  const { t } = useT();
  return (
    <Shell content={content}>
      <h1 className="mb-4 font-display text-[28px] font-semibold">{t('roadmap')}</h1>
      <RoadmapList content={content} />
    </Shell>
  );
}
export function AboutPage() {
  const content = useContent();
  const { t } = useT();
  return (
    <Shell content={content}>
      <h1 className="mb-4 font-display text-[28px] font-semibold">{t('about')}</h1>
      <AboutContent content={content} />
    </Shell>
  );
}
