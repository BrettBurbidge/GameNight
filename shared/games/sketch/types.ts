import type { PlayerId } from '../../types';

export { CANVAS_H, CANVAS_W, type DrawOp, type StreamEvent, type StreamSnapshot } from '../../drawing';

export type SketchAction = { type: 'choose'; index: number } | { type: 'guess'; text: string };

export interface FeedItem {
  id: number;
  kind: 'guess' | 'correct' | 'close' | 'insider' | 'steal' | 'system';
  playerId: PlayerId | null;
  text: string;
}

export interface TurnResult {
  word: string;
  drawerId: PlayerId;
  reason: 'all-guessed' | 'time' | 'stolen' | 'skipped';
  points: Record<PlayerId, number>;
  team: { drawing: 0 | 1; points: number; stolenBy: 0 | 1 | null } | null;
}

export interface SketchView {
  mode: 'ffa' | 'teams';
  phase: 'choosing' | 'drawing' | 'steal' | 'reveal' | 'over';
  round: number;
  totalRounds: number;
  turnId: number;
  drawerId: PlayerId;
  players: PlayerId[];
  teams: [PlayerId[], PlayerId[]] | null;
  activeTeam: 0 | 1;
  /** Only the drawer sees the three options while choosing. */
  choices: string[] | null;
  /** The word, for the drawer, players who already guessed it, and everyone once it is revealed. */
  word: string | null;
  /** Hint pattern for everyone else: a letter, or null for a hidden letter. Spaces and dashes are shown. */
  mask: (string | null)[] | null;
  phaseEndsAt: number | null;
  phaseMs: number;
  guessed: PlayerId[];
  scores: Record<PlayerId, number>;
  teamScores: [number, number];
  feed: FeedItem[];
  role: 'drawer' | 'guesser' | 'guessed' | 'watcher' | 'stealer' | 'spectator';
  lastResult: TurnResult | null;
  winners: PlayerId[];
  winningTeam: 0 | 1 | 'tie' | null;
}
