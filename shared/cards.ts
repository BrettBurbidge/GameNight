// Standard 52-card deck helpers, reusable by every card game (Hearts, Spades, Euchre...).

export type Suit = 'C' | 'D' | 'S' | 'H';
/** e.g. "QS" = queen of spades, "10H" = ten of hearts. Rank 11–14 = J Q K A. */
export type CardId = string;

export const SUITS: Suit[] = ['C', 'D', 'S', 'H'];
export const SUIT_SYMBOL: Record<Suit, string> = { C: '♣', D: '♦', S: '♠', H: '♥' };
export const SUIT_NAME: Record<Suit, string> = { C: 'Clubs', D: 'Diamonds', S: 'Spades', H: 'Hearts' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function cardId(rank: number, suit: Suit): CardId {
  return `${RANK_LABEL[rank] ?? rank}${suit}`;
}

export function suitOf(card: CardId): Suit {
  return card[card.length - 1] as Suit;
}

export function rankOf(card: CardId): number {
  const r = card.slice(0, -1);
  return ({ J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[r] ?? Number(r);
}

export function rankLabel(card: CardId): string {
  return card.slice(0, -1);
}

export function isRed(card: CardId): boolean {
  const s = suitOf(card);
  return s === 'H' || s === 'D';
}

export function fullDeck(): CardId[] {
  return SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => cardId(i + 2, s)));
}

export function shuffled<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort for display: grouped by suit (alternating colours), ascending rank. */
export function sortHand(cards: CardId[]): CardId[] {
  const order: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 };
  return [...cards].sort((a, b) => order[suitOf(a)] - order[suitOf(b)] || rankOf(a) - rankOf(b));
}
