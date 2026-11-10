import type { WorldId } from '@lattice/shared';

/**
 * Original, synthesized sound identity (Web Audio API) — no third-party audio files, so no licensing risk.
 * Off by default; created only after a user gesture. Peaks are kept low (master gain 0.25).
 */
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let bed: { stop: () => void } | null = null;

const MOTIF: Record<WorldId, number> = { waxbarasho: 523.25, midnimo: 659.25, hoggaan: 783.99 }; // C5, E5, G5

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.25;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; pan?: number } = {}) {
  const a = ctx();
  if (!a || !master) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const o = a.createOscillator();
  const g = a.createGain();
  const p = a.createStereoPanner();
  o.type = opts.type ?? 'sine';
  o.frequency.value = freq;
  p.pan.value = opts.pan ?? 0;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.3, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(p).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur: number, from: number, to: number, gain = 0.12) {
  const a = ctx();
  if (!a || !master) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + dur * 0.3);
  g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  click: () => tone(1400, 0.06, { type: 'triangle', gain: 0.08 }),
  tick: () => tone(2200, 0.12, { type: 'sine', gain: 0.06 }),
  chime: (w: WorldId, delay = 0) => tone(MOTIF[w], 1.4, { gain: 0.18, delay, pan: w === 'waxbarasho' ? -0.4 : w === 'midnimo' ? 0.4 : 0 }),
  chord: () => (['waxbarasho', 'midnimo', 'hoggaan'] as WorldId[]).forEach((w, i) => sfx.chime(w, i * 0.12)),
  whoosh: (dur = 1.1) => noise(dur, 300, 2400, 0.1),
  swell: () => {
    tone(55, 6, { type: 'sawtooth', gain: 0.05 });
    tone(82.4, 6, { type: 'sine', gain: 0.08 });
  },
};

/** Slow ambient pad for the current place; cross-fades on change. */
export function setBed(kind: 'hub' | WorldId | null) {
  bed?.stop();
  bed = null;
  const a = ctx();
  if (!a || !master || !kind) return;
  const base = kind === 'hub' ? 110 : kind === 'waxbarasho' ? 130.8 : kind === 'midnimo' ? 164.8 : 98;
  const g = a.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.07, a.currentTime + 1.5);
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const oscs = [base, base * 1.5, base * 2.004].map((f, i) => {
    const o = a.createOscillator();
    o.type = i === 0 ? 'triangle' : 'sine';
    o.frequency.value = f;
    o.connect(lp);
    o.start();
    return o;
  });
  lp.connect(g).connect(master);
  bed = {
    stop: () => {
      const t = a.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 1.5);
      oscs.forEach((o) => o.stop(t + 1.6));
    },
  };
}

export function stopAll() {
  setBed(null);
  if (ac && ac.state === 'running') void ac.suspend();
}
