'use client';
import { useEffect, useState } from 'react';
import { contentSchema, defaultContent, t as tr, type Lang, type Localized, type SiteContent, type UiKey } from '@lattice/shared';
import { API_URL } from './env';
import { useStore } from './store';

let cache: SiteContent | null = null;
let inflight: Promise<SiteContent> | null = null;

/** Loads the latest published snapshot; falls back to the bundled copy so the site works without the API. */
export function loadContent(): Promise<SiteContent> {
  if (cache) return Promise.resolve(cache);
  if (!API_URL) return Promise.resolve(defaultContent);
  inflight ??= fetch(`${API_URL}/v1/content`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { content: unknown }) => {
      const parsed = contentSchema.safeParse(j.content);
      cache = parsed.success ? parsed.data : defaultContent;
      return cache;
    })
    .catch(() => defaultContent);
  return inflight;
}

export function useContent(): SiteContent {
  const [c, setC] = useState<SiteContent>(cache ?? defaultContent);
  useEffect(() => {
    let alive = true;
    void loadContent().then((x) => alive && setC(x));
    return () => {
      alive = false;
    };
  }, []);
  return c;
}

export function useLang(): Lang {
  return useStore((s) => s.lang);
}

/** Returns translators bound to the current language. */
export function useT() {
  const lang = useLang();
  return {
    lang,
    t: (k: UiKey) => tr(k, lang),
    l: (v: Localized | undefined) => (v ? v[lang] : ''),
  };
}
