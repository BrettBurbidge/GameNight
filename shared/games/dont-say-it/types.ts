import type { PlayerId } from '../../types';

export type DontSayItAction =
  | { type: 'start-turn'; takeOver?: boolean }
  | { type: 'guess'; text: string }
  | { type: 'clue'; text: string }
  // `seq` is the card the player was looking at (the view's `cardSeq`). A tap that lands after the card
  // has already changed is dropped, so lag or two people tapping at once can't hit the next card too.
  | { type: 'correct'; seq: number }
  | { type: 'skip'; seq: number }
  | { type: 'buzz'; seq: number };

/** A fresh card can't be buzzed for this long: nobody has said anything yet, so it can only be a stray tap. */
export const BUZZ_LOCK_MS = 1500;
/** Same idea for the clue giver's "got it" / skip buttons, which guards against a double tap. */
export const GIVER_LOCK_MS = 500;

export interface WordCard {
  word: string;
  forbidden: string[];
}

export type CardResult = 'correct' | 'skip' | 'forbidden';

export interface FeedItem {
  id: number;
  kind: 'guess' | 'clue' | CardResult;
  playerId: PlayerId | null;
  text: string;
}

export interface TurnSummary {
  team: 0 | 1;
  giverId: PlayerId;
  results: { word: string; result: CardResult }[];
  points: number;
}

export interface DontSayItView {
  phase: 'ready' | 'turn' | 'over';
  mode: 'teams' | 'coop';
  teams: [PlayerId[], PlayerId[]];
  scores: [number, number];
  activeTeam: 0 | 1;
  giverId: PlayerId;
  turnEndsAt: number | null;
  turnSeconds: number;
  turnsTaken: number;
  totalTurns: number;
  /** Only sent to the clue giver and the opposing team while a turn is live. */
  card: WordCard | null;
  cardSeq: number;
  role: 'giver' | 'guesser' | 'watcher' | 'spectator';
  feed: FeedItem[];
  results: { word: string; result: CardResult }[];
  lastTurn: TurnSummary | null;
  lastEvent: { kind: CardResult; word: string; seq: number; by: PlayerId | null } | null;
  winner: 0 | 1 | 'tie' | null;
}
