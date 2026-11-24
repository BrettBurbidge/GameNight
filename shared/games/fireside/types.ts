import type { PlayerId } from '../../types';

/** A choice card's option index, or the player named on a "who" card. */
export type Pick = number | PlayerId;

// `seq` says which card the player was looking at, so a click that lands just after the card changed is dropped.
export type FiresideAction =
  /** Any player, on a choice or who card: pick (or re-pick) in secret. */
  | { type: 'vote'; seq: number; pick: Pick }
  /** Card holder: show the picks without waiting for everyone. */
  | { type: 'reveal'; seq: number }
  /** Card holder: swap this card for another, before anything is revealed. */
  | { type: 'pass'; seq: number }
  /** Card holder: the talking is done, next card. */
  | { type: 'next'; seq: number }
  /** Any player: vote (or un-vote) to call it a night. */
  | { type: 'end' };

export interface FiresideAward {
  id: 'kindred' | 'wolf' | 'named';
  players: PlayerId[];
  /** kindred: cards agreed on. wolf: times outvoted. named: votes received. */
  count: number;
  /** kindred: cards both voted on. */
  of?: number;
}

export interface FiresideView {
  phase: 'cards' | 'over';
  /** Seated players in turn order. */
  order: PlayerId[];
  role: 'player' | 'spectator';

  cardNo: number;
  totalCards: number;
  /** Changes every time a new card is dealt. */
  seq: number;
  card: { kind: 'open' | 'choice' | 'who'; text: string; options: string[]; deck: string; emoji: string; spicy: boolean } | null;
  holderId: PlayerId;

  /** Who has locked in a pick. What they picked stays hidden until the reveal. */
  voted: PlayerId[];
  myPick: Pick | null;
  revealed: boolean;
  /** Everyone's picks, only once revealed. */
  picks: Record<PlayerId, Pick> | null;

  endVotes: PlayerId[];
  endVotesNeeded: number;

  /** The closing tally, once the game is over. */
  cardsPlayed: number;
  splits: number;
  unanimous: number;
  awards: FiresideAward[];
}
