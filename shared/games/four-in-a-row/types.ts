import type { PlayerId } from '../../types';

export const COLS = 7;
export const ROWS = 6;

/** Cell index = row * COLS + col, row 0 at the top. -1 empty, otherwise the seat (0 = red, 1 = yellow). */
export type Cell = -1 | 0 | 1;

export type FourAction = { type: 'drop'; col: number };

export interface FourView {
  phase: 'playing' | 'game-over' | 'match-over';
  seats: [PlayerId, PlayerId];
  /** Your seat, or -1 if you're watching. */
  you: -1 | 0 | 1;
  board: Cell[];
  turn: 0 | 1;
  lastMove: { cell: number; seq: number } | null;
  winLine: number[] | null;
  /** Result of the current/last game. */
  winner: 0 | 1 | 'draw' | null;
  wins: [number, number];
  draws: number;
  gameNumber: number;
  bestOf: number;
  nextGameAt: number | null;
  matchWinner: 0 | 1 | 'draw' | null;
  /** Bumps on every new game so the board can animate a reset. */
  gameSeq: number;
}
