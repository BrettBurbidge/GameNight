import { type CardId, fullDeck, rankOf, shuffled, sortHand, suitOf } from '../../cards';
import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId } from '../../types';
import { chooseBotPass, chooseBotPlay } from './bot';
import type { HeartsAction, HeartsView, PassDirection, Play } from './types';

export interface HeartsState {
  seats: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  phase: HeartsView['phase'];
  handNumber: number;
  passDir: PassDirection;
  passes: Record<PlayerId, CardId[] | null>;
  received: Record<PlayerId, CardId[]>;
  trick: Play[];
  trickSeq: number;
  turn: PlayerId | null;
  heartsBroken: boolean;
  tricksPlayed: number;
  taken: Record<PlayerId, CardId[]>;
  scores: Record<PlayerId, number>;
  history: Record<PlayerId, number>[];
  lastTrick: { plays: Play[]; winner: PlayerId } | null;
  pendingWinner: PlayerId | null;
  pauseUntil: number | null;
  handOverUntil: number | null;
  ready: PlayerId[];
  moonShooter: PlayerId | null;
  targetScore: number;
  botDelay: number;
}

const PASS_ORDER: PassDirection[] = ['left', 'right', 'across', 'none'];
const TRICK_PAUSE_MS = 1300;
const HAND_OVER_MS = 20000;
const BOT_DELAYS: Record<string, number> = { fast: 350, normal: 800, chill: 1400 };

export const QUEEN_OF_SPADES = 'QS';
export const TWO_OF_CLUBS = '2C';

export function cardPoints(card: CardId): number {
  if (card === QUEEN_OF_SPADES) return 13;
  return suitOf(card) === 'H' ? 1 : 0;
}

function passTarget(state: HeartsState, from: PlayerId): PlayerId {
  const i = state.seats.indexOf(from);
  const offset = { left: 1, across: 2, right: 3, none: 0 }[state.passDir];
  return state.seats[(i + offset) % 4];
}

function nextSeat(state: HeartsState, id: PlayerId): PlayerId {
  return state.seats[(state.seats.indexOf(id) + 1) % 4];
}

export function trickWinner(trick: Play[]): PlayerId {
  const lead = suitOf(trick[0].card);
  return trick.reduce((best, p) =>
    suitOf(p.card) === lead && rankOf(p.card) > rankOf(best.card) ? p : best,
  ).playerId;
}

export function legalPlays(state: HeartsState, playerId: PlayerId): CardId[] {
  const hand = state.hands[playerId] ?? [];
  if (state.phase !== 'playing' || state.turn !== playerId) return [];
  const firstTrick = state.tricksPlayed === 0;

  if (state.trick.length === 0) {
    if (firstTrick) return hand.filter((c) => c === TWO_OF_CLUBS);
    if (!state.heartsBroken) {
      const nonHearts = hand.filter((c) => suitOf(c) !== 'H');
      if (nonHearts.length) return nonHearts;
    }
    return hand;
  }

  const lead = suitOf(state.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === lead);
  if (follow.length) return follow;
  if (firstTrick) {
    const safe = hand.filter((c) => cardPoints(c) === 0);
    if (safe.length) return safe;
  }
  return hand;
}

function deal(state: HeartsState, ctx: GameContext) {
  const deck = shuffled(fullDeck(), ctx.random);
  state.seats.forEach((id, i) => {
    state.hands[id] = sortHand(deck.slice(i * 13, i * 13 + 13));
    state.passes[id] = null;
    state.received[id] = [];
    state.taken[id] = [];
  });
  state.passDir = PASS_ORDER[state.handNumber % 4];
  state.trick = [];
  state.tricksPlayed = 0;
  state.heartsBroken = false;
  state.lastTrick = null;
  state.pendingWinner = null;
  state.pauseUntil = null;
  state.handOverUntil = null;
  state.ready = [];
  state.moonShooter = null;
  if (state.passDir === 'none') startPlay(state);
  else {
    state.phase = 'passing';
    state.turn = null;
  }
}

function startPlay(state: HeartsState) {
  state.phase = 'playing';
  state.turn = state.seats.find((id) => state.hands[id].includes(TWO_OF_CLUBS)) ?? state.seats[0];
}

function completePassing(state: HeartsState) {
  for (const from of state.seats) {
    const cards = state.passes[from]!;
    state.hands[from] = state.hands[from].filter((c) => !cards.includes(c));
  }
  for (const from of state.seats) {
    const to = passTarget(state, from);
    const cards = state.passes[from]!;
    state.hands[to] = sortHand([...state.hands[to], ...cards]);
    state.received[to] = cards;
  }
  startPlay(state);
}

function collectTrick(state: HeartsState, ctx: GameContext) {
  const winner = state.pendingWinner!;
  state.taken[winner].push(...state.trick.map((p) => p.card).filter((c) => cardPoints(c) > 0));
  state.lastTrick = { plays: state.trick, winner };
  state.trick = [];
  state.pendingWinner = null;
  state.pauseUntil = null;
  state.tricksPlayed++;
  if (state.tricksPlayed === 13) scoreHand(state, ctx);
  else state.turn = winner;
}

function scoreHand(state: HeartsState, ctx: GameContext) {
  const points: Record<PlayerId, number> = {};
  for (const id of state.seats) points[id] = state.taken[id].reduce((s, c) => s + cardPoints(c), 0);
  const shooter = state.seats.find((id) => points[id] === 26) ?? null;
  if (shooter) {
    for (const id of state.seats) points[id] = id === shooter ? 0 : 26;
    state.moonShooter = shooter;
    ctx.announce('🌙 Someone shot the moon!');
  }
  for (const id of state.seats) state.scores[id] += points[id];
  state.history.push(points);
  state.turn = null;
  state.handNumber++;
  if (state.seats.some((id) => state.scores[id] >= state.targetScore)) {
    state.phase = 'game-over';
  } else {
    state.phase = 'hand-over';
    state.handOverUntil = ctx.now + HAND_OVER_MS;
  }
}

function winners(state: HeartsState): PlayerId[] {
  if (state.phase !== 'game-over') return [];
  const low = Math.min(...state.seats.map((id) => state.scores[id]));
  return state.seats.filter((id) => state.scores[id] === low);
}

function renameKey<T>(record: Record<PlayerId, T>, from: PlayerId, to: PlayerId) {
  if (from in record) {
    record[to] = record[from];
    delete record[from];
  }
}

export const hearts: GameDefinition<HeartsState, HeartsAction, HeartsView> = {
  id: 'hearts',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length === 4 ? null : 'Hearts needs exactly 4 players.';
  },

  setup(players, config, ctx) {
    const seats = players.filter((p) => !p.spectator).slice(0, 4).map((p) => p.id);
    const state: HeartsState = {
      seats,
      hands: {},
      phase: 'passing',
      handNumber: 0,
      passDir: 'left',
      passes: {},
      received: {},
      trick: [],
      trickSeq: 0,
      turn: null,
      heartsBroken: false,
      tricksPlayed: 0,
      taken: {},
      scores: Object.fromEntries(seats.map((id) => [id, 0])),
      history: [],
      lastTrick: null,
      pendingWinner: null,
      pauseUntil: null,
      handOverUntil: null,
      ready: [],
      moonShooter: null,
      targetScore: Number(config.targetScore ?? 100),
      botDelay: BOT_DELAYS[String(config.botSpeed)] ?? BOT_DELAYS.normal,
    };
    deal(state, ctx);
    return state;
  },

  action(state, playerId, action, ctx) {
    if (!state.seats.includes(playerId)) return 'You are not seated at this table.';

    switch (action.type) {
      case 'pass': {
        if (state.phase !== 'passing') return 'It is not time to pass.';
        if (state.passes[playerId]) return 'You already passed.';
        const cards = [...new Set(action.cards)];
        if (cards.length !== 3) return 'Pick exactly three cards.';
        if (!cards.every((c) => state.hands[playerId].includes(c))) return 'You do not hold those cards.';
        state.passes[playerId] = cards;
        if (state.seats.every((id) => state.passes[id])) completePassing(state);
        return;
      }
      case 'play': {
        if (state.phase !== 'playing' || state.turn !== playerId) return 'It is not your turn.';
        if (state.pendingWinner) return 'Wait for the trick to be collected.';
        if (!legalPlays(state, playerId).includes(action.card)) return 'You cannot play that card.';
        state.hands[playerId] = state.hands[playerId].filter((c) => c !== action.card);
        state.trick.push({ playerId, card: action.card });
        state.trickSeq++;
        if (suitOf(action.card) === 'H') state.heartsBroken = true;
        if (state.trick.length === 4) {
          state.pendingWinner = trickWinner(state.trick);
          state.pauseUntil = ctx.now + TRICK_PAUSE_MS;
          state.turn = null;
        } else {
          state.turn = nextSeat(state, playerId);
        }
        return;
      }
      case 'next': {
        if (state.phase !== 'hand-over') return;
        if (!state.ready.includes(playerId)) state.ready.push(playerId);
        if (state.ready.length === state.seats.length) deal(state, ctx);
        return;
      }
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.pauseUntil !== null && ctx.now >= state.pauseUntil) {
      collectTrick(state, ctx);
      return true;
    }
    if (state.phase === 'hand-over' && state.handOverUntil !== null && ctx.now >= state.handOverUntil) {
      deal(state, ctx);
      return true;
    }
    return false;
  },

  bot(state, botId) {
    if (state.phase === 'passing' && !state.passes[botId]) {
      return { type: 'pass', cards: chooseBotPass(state.hands[botId]) };
    }
    if (state.phase === 'playing' && state.turn === botId && !state.pendingWinner) {
      return { type: 'play', card: chooseBotPlay(state, botId, legalPlays(state, botId)) };
    }
    if (state.phase === 'hand-over' && !state.ready.includes(botId)) return { type: 'next' };
    return null;
  },

  botDelay: (state) => state.botDelay,

  swapPlayer(state, from, to) {
    state.seats = state.seats.map((id) => (id === from ? to : id));
    for (const record of [state.hands, state.passes, state.received, state.taken, state.scores, ...state.history]) {
      renameKey(record as Record<PlayerId, unknown>, from, to);
    }
    state.trick = state.trick.map((p) => (p.playerId === from ? { ...p, playerId: to } : p));
    if (state.lastTrick) {
      state.lastTrick.plays = state.lastTrick.plays.map((p) => (p.playerId === from ? { ...p, playerId: to } : p));
      if (state.lastTrick.winner === from) state.lastTrick.winner = to;
    }
    if (state.turn === from) state.turn = to;
    if (state.pendingWinner === from) state.pendingWinner = to;
    if (state.moonShooter === from) state.moonShooter = to;
    state.ready = state.ready.filter((id) => id !== from);
  },

  view(state, viewerId) {
    const seated = state.seats.includes(viewerId);
    const handPoints: Record<PlayerId, number> = {};
    const handCounts: Record<PlayerId, number> = {};
    const passed: Record<PlayerId, boolean> = {};
    for (const id of state.seats) {
      handPoints[id] = (state.taken[id] ?? []).reduce((s, c) => s + cardPoints(c), 0);
      handCounts[id] = state.hands[id]?.length ?? 0;
      passed[id] = !!state.passes[id];
    }
    return {
      phase: state.phase,
      seats: state.seats,
      hand: seated ? state.hands[viewerId] : [],
      handCounts,
      passDir: state.passDir,
      passed,
      myPass: seated ? state.passes[viewerId] : null,
      received: seated ? state.received[viewerId] : [],
      trick: state.trick,
      trickSeq: state.trickSeq,
      turn: state.turn,
      legal: legalPlays(state, viewerId),
      heartsBroken: state.heartsBroken,
      handNumber: state.handNumber,
      tricksPlayed: state.tricksPlayed,
      handPoints,
      scores: state.scores,
      history: state.history,
      lastTrick: state.lastTrick,
      pendingWinner: state.pendingWinner,
      moonShooter: state.moonShooter,
      targetScore: state.targetScore,
      ready: state.ready,
      handOverUntil: state.handOverUntil,
      winners: winners(state),
    };
  },

  isFinished: (state) => state.phase === 'game-over',
};
