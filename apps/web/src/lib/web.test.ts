import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBatchSchema } from '@lattice/shared';
import { exitShot, hubShot, WORLD_POS, worldShot } from './shots';
import { useStore } from './store';

describe('experience state machine', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', { now: () => 1000 });
    useStore.setState({ phase: 'entrance', world: null, station: null, overlay: null, visited: [], lit: [], facing: 'waxbarasho', quality: 'balanced', qualityLocked: false });
  });

  it('moves entrance → awakening → hub → world → hub → exit → entrance', () => {
    const s = useStore.getState();
    s.enter();
    expect(useStore.getState().phase).toBe('awakening');
    s.finishAwakening(false);
    expect(useStore.getState().phase).toBe('hub');
    s.openWorld('midnimo');
    expect(useStore.getState()).toMatchObject({ phase: 'world', world: 'midnimo', visited: ['midnimo'] });
    s.openWorld('midnimo');
    expect(useStore.getState().visited).toEqual(['midnimo']);
    s.backToHub();
    expect(useStore.getState()).toMatchObject({ phase: 'hub', world: null });
    s.goExit();
    expect(useStore.getState().phase).toBe('exit');
    s.restart();
    expect(useStore.getState().phase).toBe('entrance');
  });

  it('orbits around the three worlds in both directions', () => {
    const s = useStore.getState();
    s.orbit(1);
    expect(useStore.getState().facing).toBe('midnimo');
    s.orbit(1);
    s.orbit(1);
    expect(useStore.getState().facing).toBe('waxbarasho');
    s.orbit(-1);
    expect(useStore.getState().facing).toBe('hoggaan');
  });

  it('steps quality down one level at a time and never below lite, and respects a manual lock', () => {
    const s = useStore.getState();
    expect(s.stepDownQuality()).toBe('lite');
    expect(useStore.getState().stepDownQuality()).toBeNull();
    useStore.getState().setQuality('high', true);
    expect(useStore.getState().stepDownQuality()).toBeNull();
  });

  it('lights Midnimo platforms once each', () => {
    const s = useStore.getState();
    s.light('peer-mentoring');
    s.light('peer-mentoring');
    expect(useStore.getState().lit).toEqual(['peer-mentoring']);
  });
});

describe('camera shots', () => {
  const finite = (v: number[]) => v.every(Number.isFinite);
  it('produces finite shots for every world, station and orientation', () => {
    for (const portrait of [true, false]) {
      for (const w of ['waxbarasho', 'midnimo', 'hoggaan'] as const) {
        const h = hubShot(w, portrait);
        expect(finite([...h.pos, ...h.target])).toBe(true);
        for (const st of [null, 0, 1, 2, 3]) {
          const s = worldShot(w, st, portrait);
          expect(finite([...s.pos, ...s.target])).toBe(true);
          expect(s.fov).toBeGreaterThan(20);
          expect(s.fov).toBeLessThan(70);
        }
      }
      expect(finite(exitShot(portrait).pos)).toBe(true);
    }
  });
  it('keeps world overview cameras off the light-bridge axis', () => {
    for (const w of ['waxbarasho', 'midnimo', 'hoggaan'] as const) {
      const s = worldShot(w, null, true);
      const o = WORLD_POS[w];
      const toCam = [s.pos[0] - o[0], s.pos[2] - o[2]];
      const toHub = [-o[0], -o[2]];
      const cos = (toCam[0]! * toHub[0]! + toCam[1]! * toHub[1]!) / (Math.hypot(toCam[0]!, toCam[1]!) * Math.hypot(toHub[0]!, toHub[1]!));
      expect(Math.acos(cos)).toBeGreaterThan(0.25); // > ~14° off the bridge
    }
  });
});

describe('analytics payloads', () => {
  it('builds batches the API schema accepts and never includes identifiers', async () => {
    vi.stubGlobal('window', { location: { search: '?src=qr-hall' }, addEventListener: () => undefined, innerWidth: 390, screen: { width: 390 }, matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('document', { addEventListener: () => undefined, visibilityState: 'visible' });
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const { track, _queued } = await import('./analytics');
    track('page_view');
    track('world_opened', { world: 'hoggaan', worldsVisited: 1 });
    const parsed = eventBatchSchema.safeParse({ v: 1, events: _queued() });
    expect(parsed.success).toBe(true);
    expect(_queued()[0]).toMatchObject({ newToday: true, src: 'qr-hall', deviceClass: 'mobile' });
    expect(JSON.stringify(_queued())).not.toMatch(/userAgent|ip|cookie|id"/i);
  });
});
