'use client';
import { create } from 'zustand';
import type { Lang, QualityProfile, WorldId } from '@lattice/shared';

export type Phase = 'entrance' | 'awakening' | 'hub' | 'world' | 'exit';
export type Overlay = null | 'profile' | 'roadmap' | 'settings' | 'about' | 'menu';
export const WORLD_ORDER: WorldId[] = ['waxbarasho', 'midnimo', 'hoggaan'];
const QUALITY_STEPS: QualityProfile[] = ['high', 'balanced', 'lite'];

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface State {
  phase: Phase;
  facing: WorldId;
  world: WorldId | null;
  station: number | null;
  overlay: Overlay;
  roadmapIndex: number;
  roadmapView: 'ring' | 'list';
  roadmapFilter: 'all' | WorldId | 'approval';
  quality: QualityProfile;
  qualityLocked: boolean;
  motion: 'full' | 'reduced';
  sound: boolean;
  lang: Lang;
  visited: WorldId[];
  lit: string[];
  feedback: 'hidden' | 'offered' | 'done';
  announce: string;
  toasts: Toast[];
  enteredAt: number | null;
  hubAt: number | null;
  /** Content points the visitor has actually read (open for over 1.2 s). Kept in memory only. */
  readItems: string[];
  cta: 'hidden' | 'pending' | 'vote' | 'feedback' | 'done';

  enter: () => void;
  finishAwakening: (skipped: boolean) => void;
  face: (w: WorldId) => void;
  orbit: (dir: 1 | -1) => void;
  openWorld: (w: WorldId) => void;
  openStation: (i: number | null) => void;
  backToHub: () => void;
  goExit: () => void;
  restart: () => void;
  setOverlay: (o: Overlay) => void;
  setRoadmap: (p: Partial<Pick<State, 'roadmapIndex' | 'roadmapView' | 'roadmapFilter'>>) => void;
  setQuality: (q: QualityProfile, locked?: boolean) => void;
  stepDownQuality: () => QualityProfile | null;
  setMotion: (m: State['motion']) => void;
  setSound: (s: boolean) => void;
  setLang: (l: Lang) => void;
  light: (platform: string) => void;
  setFeedback: (f: State['feedback']) => void;
  say: (text: string) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  markRead: (key: string) => void;
  setCta: (c: State['cta']) => void;
}

let toastId = 0;

export const useStore = create<State>()((set, get) => ({
  phase: 'entrance',
  facing: 'waxbarasho',
  world: null,
  station: null,
  overlay: null,
  roadmapIndex: 0,
  roadmapView: 'ring',
  roadmapFilter: 'all',
  quality: 'balanced',
  qualityLocked: false,
  motion: 'full',
  sound: false,
  lang: 'so',
  visited: [],
  lit: [],
  feedback: 'hidden',
  announce: '',
  toasts: [],
  enteredAt: null,
  hubAt: null,
  readItems: [],
  cta: 'hidden',

  enter: () => set({ phase: 'awakening', enteredAt: performance.now() }),
  finishAwakening: () => set({ phase: 'hub', hubAt: performance.now() }),
  face: (w) => set({ facing: w }),
  orbit: (dir) => {
    const i = WORLD_ORDER.indexOf(get().facing);
    set({ facing: WORLD_ORDER[(i + dir + 3) % 3]! });
  },
  openWorld: (w) => {
    const visited = get().visited.includes(w) ? get().visited : [...get().visited, w];
    set({ phase: 'world', world: w, facing: w, station: null, overlay: null, visited, roadmapView: get().roadmapView });
  },
  openStation: (i) => set({ station: i }),
  backToHub: () => set({ phase: 'hub', world: null, station: null, overlay: null }),
  goExit: () => set({ phase: 'exit', world: null, station: null, overlay: null }),
  restart: () => set({ phase: 'entrance', world: null, station: null, overlay: null }),
  setOverlay: (o) => set({ overlay: o }),
  setRoadmap: (p) => set(p),
  setQuality: (q, locked = false) => set({ quality: q, qualityLocked: locked }),
  stepDownQuality: () => {
    const { quality, qualityLocked } = get();
    if (qualityLocked) return null;
    const i = QUALITY_STEPS.indexOf(quality);
    if (i < 0 || i >= QUALITY_STEPS.length - 1) return null;
    const next = QUALITY_STEPS[i + 1]!;
    set({ quality: next });
    return next;
  },
  setMotion: (m) => set({ motion: m }),
  setSound: (s) => set({ sound: s }),
  setLang: (l) => set({ lang: l }),
  light: (p) => set({ lit: get().lit.includes(p) ? get().lit : [...get().lit, p] }),
  setFeedback: (f) => set({ feedback: f }),
  say: (text) => set({ announce: text }),
  toast: (t) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  markRead: (key) => {
    const { readItems, cta } = get();
    if (readItems.includes(key)) return;
    const next = [...readItems, key];
    // After three different content points the visitor is offered the next step (shown once they close the card).
    set({ readItems: next, ...(next.length >= 3 && cta === 'hidden' ? { cta: 'pending' as const } : {}) });
  },
  setCta: (c) => set({ cta: c }),
}));
