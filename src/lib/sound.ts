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
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * Browsers only allow audio to start inside a user gesture, and may suspend it again later
 * (e.g. after the tab is hidden). Game sounds fire from network events, so re-arm on every gesture.
 */
function unlock() {
  audio();
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
}

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
  osc.connect(amp).connect(master ?? ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.05);
}

const SOUNDS: Record<SoundName, (ac: AudioContext) => void> = {
  // A bright little "crack": two quick falling chimes.
  heartsBroken: (ac) => {
    tone(ac, { freq: 1568, to: 1046, start: 0, dur: 0.2, type: 'triangle', gain: 0.4 });
    tone(ac, { freq: 1175, to: 587, start: 0.13, dur: 0.38, type: 'triangle', gain: 0.35 });
  },
  // An ominous "dun-dun-DUN", pitched high enough for laptop and phone speakers.
  queenOfSpades: (ac) => {
    tone(ac, { freq: 392, start: 0, dur: 0.22, type: 'square', gain: 0.14 });
    tone(ac, { freq: 370, start: 0.26, dur: 0.22, type: 'square', gain: 0.14 });
    tone(ac, { freq: 294, to: 220, start: 0.54, dur: 0.8, type: 'square', gain: 0.16 });
    tone(ac, { freq: 147, to: 110, start: 0.54, dur: 0.8, type: 'triangle', gain: 0.3 });
  },
};

export function playSound(name: SoundName) {
  if (muted) return;
  const ac = audio();
  if (ac) SOUNDS[name](ac);
}
