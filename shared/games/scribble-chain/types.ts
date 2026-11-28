import type { DrawOp, StreamSnapshot } from '../../drawing';
import type { PlayerId } from '../../types';

export type ChainAction =
  /** Prompt phase: pick one of your three deck words. */
  | { type: 'choose'; index: number }
  /** Prompt phase, "write your own" games: your own prompt. */
  | { type: 'write'; text: string }
  /** Guess phase. A draft is saved (so the clock can't eat it) without marking you finished. */
  | { type: 'guess'; text: string; draft?: boolean }
  /** Draw phase: finished drawing. */
  | { type: 'done' }
  /** Draw or guess phase: changed your mind, keep working. */
  | { type: 'edit' }
  /** Reveal: flip to the next page (the book's owner or the host). */
  | { type: 'next' };

export type ChainPhase = 'prompt' | 'draw' | 'guess' | 'reveal' | 'over';

/** One page of a book as shown at the reveal. Drawings are fetched by `key` (see ChainSync). */
export type RevealPage =
  | { kind: 'word' | 'guess'; by: PlayerId; text: string; missed: boolean }
  | { kind: 'draw'; by: PlayerId; key: string; missed: boolean };

export interface ChainView {
  phase: ChainPhase;
  /** 0 while picking prompts, then 1…steps: odd steps draw, even steps guess. */
  step: number;
  steps: number;
  /** Seat order. Books are passed along it. */
  players: PlayerId[];
  /** Who has finished the current step. */
  done: PlayerId[];
  phaseEndsAt: number | null;
  phaseMs: number;
  role: 'player' | 'spectator';
  /** Prompt phase: "write your own" game. */
  custom: boolean;
  /** Prompt phase: your three deck words. */
  choices: string[] | null;
  /** Prompt phase: what you have picked so far. */
  myPrompt: string | null;
  /** What is in front of you this step. */
  task:
    | { kind: 'draw'; text: string; from: PlayerId }
    | { kind: 'guess'; key: string; from: PlayerId; blank: boolean }
    | null;
  /** Guess phase: what you have typed so far. */
  myGuess: string | null;
  reveal: {
    book: number;
    books: number;
    owner: PlayerId;
    /** Pages flipped so far, oldest first. */
    pages: RevealPage[];
    totalPages: number;
  } | null;
  /** Once it is over: every book, so the end screen can list them and save them as pictures. */
  books: { owner: PlayerId; pages: RevealPage[] }[] | null;
}

/**
 * The reply to `game:stream-sync`. While drawing it is your own page so far (the StreamSnapshot part);
 * `drawings` holds the finished pictures you are allowed to see right now, keyed like the view refers to them.
 */
export interface ChainSync extends StreamSnapshot {
  drawings: Record<string, DrawOp[]>;
}
