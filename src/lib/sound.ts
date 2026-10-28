import { useCallback, useSyncExternalStore } from 'react';

// Tiny synthesized sound effects (Web Audio, no asset files) plus a per-browser mute setting.
// Any game can call playSound(); it is a no-op while muted.

export type SoundName = 'heartsBroken' | 'queenOfSpades';

const KEY = 'gamenight.muted.v1';
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

export function useMuted() {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
  );
  const toggle = useCallback(() => {
    muted = !muted;
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
    if (!muted) unlock();
  }, []);
  return [value, toggle] as const;
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Browsers only allow audio after a user gesture; warm the context on the first click. */
function unlock() {
  audio();
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlock, { once: true });

function tone(ac: AudioContext, opts: { freq: number; to?: number; start: number; dur: number; type?: OscillatorType; gain?: number }) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const t0 = ac.currentTime + opts.start;
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.05);
}

const SOUNDS: Record<SoundName, (ac: AudioContext) => void> = {
  // A bright little "crack": two quick falling chimes.
  heartsBroken: (ac) => {
    tone(ac, { freq: 1320, to: 880, start: 0, dur: 0.18, type: 'triangle', gain: 0.18 });
    tone(ac, { freq: 990, to: 520, start: 0.12, dur: 0.32, type: 'triangle', gain: 0.16 });
  },
  // An ominous "dun-dun-DUN".
  queenOfSpades: (ac) => {
    tone(ac, { freq: 196, start: 0, dur: 0.22, type: 'sawtooth', gain: 0.08 });
    tone(ac, { freq: 185, start: 0.24, dur: 0.22, type: 'sawtooth', gain: 0.08 });
    tone(ac, { freq: 147, to: 110, start: 0.5, dur: 0.7, type: 'sawtooth', gain: 0.11 });
    tone(ac, { freq: 73.5, to: 55, start: 0.5, dur: 0.7, type: 'sine', gain: 0.18 });
  },
};

export function playSound(name: SoundName) {
  if (muted) return;
  const ac = audio();
  if (ac) SOUNDS[name](ac);
}
