import type { PlayerId } from '../../types';

export type CodeWordsAction =
  /** Cipher: send this round's clue. */
  | { type: 'clue'; text: string }
  /** Guesser: put a word in one of your two slots (null clears it). */
  | { type: 'pick'; slot: Slot; wordIndex: number | null }
  /** Guesser: commit your picks for the round. */
  | { type: 'lock' }
  /** Anyone seated: move past the reveal. `round` guards against double clicks. */
  | { type: 'next'; round: number };

export type Slot = 'crack' | 'intercept';

export interface Picks {
  /** The word you think your own cipher meant. */
  crack: number | null;
  /** The word you think the other team's cipher meant. */
  intercept: number | null;
}

export interface RoundResult {
  round: number;
  clues: [string | null, string | null];
  /** The board word each cipher was pointing at. */
  targets: [number, number];
  /** What each team went with, after counting its guessers' picks. */
  answers: [Picks, Picks];
  cracked: [boolean, boolean];
  /** Team i read team (1 - i)'s clue correctly. */
  intercepted: [boolean, boolean];
  gained: [number, number];
}

export interface CodeWordsView {
  phase: 'clue' | 'guess' | 'reveal' | 'over';
  board: string[];
  /** Which team's word each tile turned out to be, once it has been played. */
  claimed: (0 | 1 | null)[];
  teams: [PlayerId[], PlayerId[]];
  cipherIds: [PlayerId, PlayerId];
  scores: [number, number];
  round: number;
  totalRounds: number;

  myTeam: 0 | 1 | null;
  role: 'cipher' | 'guesser' | 'spectator';
  /** Your own team's word. Ciphers only, and only before the reveal. */
  myTarget: number | null;
  /** Hidden until the clues go out together; a cipher always sees their own. */
  clues: [string | null, string | null];
  clueSent: [boolean, boolean];
  myPicks: Picks;
  /** How many of your teammates are on each word, so you can converge without talking. */
  tally: { crack: Record<number, number>; intercept: Record<number, number> };
  /** Everyone who has committed, in the order they did it. */
  locked: PlayerId[];
  endsAt: number | null;
  phaseSeconds: number;
  result: RoundResult | null;
  winner: 0 | 1 | 'tie' | null;
}
