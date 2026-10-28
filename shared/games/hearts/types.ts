import type { CardId } from '../../cards';
import type { PlayerId } from '../../types';

export type PassDirection = 'left' | 'right' | 'across' | 'none';

export type HeartsAction = { type: 'pass'; cards: CardId[] } | { type: 'play'; card: CardId } | { type: 'next' };

export interface Play {
  playerId: PlayerId;
  card: CardId;
}

export interface HeartsView {
  phase: 'passing' | 'playing' | 'hand-over' | 'game-over';
  /** Clockwise seat order. */
  seats: PlayerId[];
  hand: CardId[];
  handCounts: Record<PlayerId, number>;
  passDir: PassDirection;
  passed: Record<PlayerId, boolean>;
  myPass: CardId[] | null;
  received: CardId[];
  trick: Play[];
  trickSeq: number;
  turn: PlayerId | null;
  legal: CardId[];
  heartsBroken: boolean;
  handNumber: number;
  tricksPlayed: number;
  /** Points each player has taken so far this hand. */
  handPoints: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  history: Record<PlayerId, number>[];
  lastTrick: { plays: Play[]; winner: PlayerId } | null;
  pendingWinner: PlayerId | null;
  moonShooter: PlayerId | null;
  targetScore: number;
  ready: PlayerId[];
  handOverUntil: number | null;
  winners: PlayerId[];
}
