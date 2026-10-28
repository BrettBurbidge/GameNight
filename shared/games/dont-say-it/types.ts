import type { PlayerId } from '../../types';

export type DontSayItAction =
  | { type: 'start-turn'; takeOver?: boolean }
  | { type: 'guess'; text: string }
  | { type: 'clue'; text: string }
  | { type: 'correct' }
  | { type: 'skip' }
  | { type: 'buzz' };

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
