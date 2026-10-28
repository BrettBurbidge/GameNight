import { type CardId, rankOf, suitOf } from '../../cards';
import type { PlayerId } from '../../types';
import type { HeartsState } from './logic';

// A heuristic Hearts bot: passes dangerous cards, ducks under the winning card,
// dumps the Queen of Spades and high hearts when void.

const isPoint = (c: CardId) => c === 'QS' || suitOf(c) === 'H';
const highSpade = (c: CardId) => c === 'QS' || c === 'KS' || c === 'AS';
const byRank = (a: CardId, b: CardId) => rankOf(a) - rankOf(b);

function danger(card: CardId, hand: CardId[]): number {
  const suit = suitOf(card);
  const suitCount = hand.filter((c) => suitOf(c) === suit).length;
  let score = rankOf(card);
  if (highSpade(card)) {
    // Plenty of low spades protect the queen; otherwise get rid of it.
    const lowSpades = hand.filter((c) => suitOf(c) === 'S' && rankOf(c) < 12).length;
    score += lowSpades >= 4 ? 2 : 20;
  }
  if (suit === 'H') score += 3;
  if (suitCount <= 2 && suit !== 'S') score += 4; // helps create a void
  return score;
}

export function chooseBotPass(hand: CardId[]): CardId[] {
  return [...hand].sort((a, b) => danger(b, hand) - danger(a, hand)).slice(0, 3);
}

export function chooseBotPlay(state: HeartsState, botId: PlayerId, legal: CardId[]): CardId {
  if (legal.length === 1) return legal[0];
  const trick = state.trick;

  if (trick.length === 0) {
    // Lead low from a suit that is unlikely to come back with points; keep high spades home.
    const hand = state.hands[botId];
    const safe = legal.filter((c) => !highSpade(c) && !(suitOf(c) === 'S' && hand.includes('QS')));
    const pool = safe.length ? safe : legal;
    const suitLen = (c: CardId) => hand.filter((h) => suitOf(h) === suitOf(c)).length;
    return [...pool].sort((a, b) => byRank(a, b) || suitLen(a) - suitLen(b))[0];
  }

  const lead = suitOf(trick[0].card);
  const following = suitOf(legal[0]) === lead && legal.every((c) => suitOf(c) === lead);

  if (following) {
    const winning = Math.max(...trick.filter((p) => suitOf(p.card) === lead).map((p) => rankOf(p.card)));
    const under = legal.filter((c) => rankOf(c) < winning).sort(byRank);
    if (under.length) return under[under.length - 1];
    const pointsOnTable = trick.some((p) => isPoint(p.card));
    const lastToPlay = trick.length === 3;
    const noQueen = legal.filter((c) => c !== 'QS').sort(byRank);
    const pool = noQueen.length ? noQueen : legal;
    // Forced to win: if it's clean and we're last, burn our highest; otherwise win as cheaply as possible.
    return lastToPlay && !pointsOnTable ? pool[pool.length - 1] : pool[0];
  }

  // Void in the led suit: dump the worst card we have.
  if (legal.includes('QS')) return 'QS';
  const bigSpade = legal.find((c) => c === 'AS' || c === 'KS');
  if (bigSpade) return bigSpade;
  const hearts = legal.filter((c) => suitOf(c) === 'H').sort(byRank);
  if (hearts.length) return hearts[hearts.length - 1];
  return [...legal].sort(byRank)[legal.length - 1];
}
