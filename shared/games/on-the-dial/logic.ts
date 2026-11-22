import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import { BANDS } from './bands';
import { MAX_BARS, signalBars } from './scoring';
import type { DialAction, DialView, RoundResult } from './types';

interface DialState {
  phase: 'clue' | 'tune' | 'reveal' | 'over';
  /** Versus needs a broadcaster plus two tuners, so two players always play co-op. */
  mode: 'versus' | 'coop';
  order: PlayerId[];
  scores: Record<PlayerId, number>;
  teamScore: number;
  /** Turns each player has had as broadcaster. The game ends once everyone has had `turnsEach`. */
  turnsTaken: Record<PlayerId, number>;
  turnsEach: number;
  round: number;
  broadcasterId: PlayerId;
  deck: number[];
  deckPos: number;
  bandIndex: number;
  target: number;
  swapped: boolean;
  clue: string | null;
  endsAt: number | null;
  clueSeconds: number;
  tuneSeconds: number;
  needles: Record<PlayerId, number>;
  locked: PlayerId[];
  result: RoundResult | null;
}

const MAX_CLUE = 60;
const REVEAL_MS = 15_000;

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const tunersOf = (state: DialState) => state.order.filter((id) => id !== state.broadcasterId);

const turnsLeft = (state: DialState) =>
  state.order.reduce((sum, id) => sum + Math.max(0, state.turnsEach - (state.turnsTaken[id] ?? 0)), 0);

function dealBand(state: DialState, ctx: GameContext) {
  if (state.deckPos >= state.deck.length) {
    state.deck = shuffle(BANDS.map((_, i) => i), ctx.random);
    state.deckPos = 0;
  }
  state.bandIndex = state.deck[state.deckPos++];
  // Keep the signal off the very ends so there is room to miss on both sides.
  state.target = 5 + Math.floor(ctx.random() * 91);
}

function startRound(state: DialState, ctx: GameContext) {
  // Whoever has broadcast least goes next; people who are away wait until last.
  const fewest = Math.min(...state.order.map((id) => state.turnsTaken[id] ?? 0));
  const due = state.order.filter((id) => (state.turnsTaken[id] ?? 0) === fewest);
  state.broadcasterId = due.find((id) => ctx.isConnected(id)) ?? due[0];
  state.phase = 'clue';
  state.clue = null;
  state.swapped = false;
  state.needles = {};
  state.locked = [];
  state.result = null;
  state.endsAt = ctx.now + state.clueSeconds * 1000;
  dealBand(state, ctx);
}

function finishRound(state: DialState, ctx: GameContext) {
  state.turnsTaken[state.broadcasterId] = (state.turnsTaken[state.broadcasterId] ?? 0) + 1;
  state.round++;
  if (turnsLeft(state) > 0) {
    startRound(state, ctx);
    return;
  }
  state.phase = 'over';
  state.endsAt = null;
  if (state.mode === 'coop') {
    ctx.announce(`Off air! You picked up ${state.teamScore} of ${state.round * MAX_BARS} bars together.`);
  } else {
    const best = Math.max(...state.order.map((id) => state.scores[id] ?? 0));
    ctx.announce(`Off air! Top score: ${best} bars.`);
  }
}

function reveal(state: DialState, ctx: GameContext) {
  const bars: Record<PlayerId, number> = {};
  const needles: Record<PlayerId, number> = {};
  for (const id of tunersOf(state)) {
    if (state.needles[id] === undefined) continue;
    needles[id] = state.needles[id];
    bars[id] = signalBars(state.needles[id], state.target);
    state.scores[id] = (state.scores[id] ?? 0) + bars[id];
  }
  const picked = Object.values(bars);
  const broadcasterBars = picked.length ? Math.round(picked.reduce((a, b) => a + b, 0) / picked.length) : 0;
  state.scores[state.broadcasterId] = (state.scores[state.broadcasterId] ?? 0) + broadcasterBars;
  state.teamScore += broadcasterBars;
  state.result = { target: state.target, needles, bars, broadcasterBars };
  state.phase = 'reveal';
  state.endsAt = ctx.now + REVEAL_MS;
}

/** True once every tuner who is still here has locked in. */
function everyoneLocked(state: DialState, ctx: GameContext) {
  const here = tunersOf(state).filter((id) => ctx.isConnected(id));
  return state.locked.length > 0 && here.every((id) => state.locked.includes(id));
}

export const onTheDial: GameDefinition<DialState, DialAction, DialView> = {
  id: 'on-the-dial',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length < 2 ? 'You need at least 2 players.' : null;
  },

  setup(players: PlayerInfo[], config, ctx) {
    const order = shuffle(players.filter((p) => !p.spectator).map((p) => p.id), ctx.random);
    const state: DialState = {
      phase: 'clue',
      mode: config.mode === 'coop' || order.length < 3 ? 'coop' : 'versus',
      order,
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      teamScore: 0,
      turnsTaken: Object.fromEntries(order.map((id) => [id, 0])),
      turnsEach: Number(config.turnsEach ?? 2),
      round: 0,
      broadcasterId: order[0],
      deck: shuffle(BANDS.map((_, i) => i), ctx.random),
      deckPos: 0,
      bandIndex: 0,
      target: 50,
      swapped: false,
      clue: null,
      endsAt: null,
      clueSeconds: Number(config.clueSeconds ?? 75),
      tuneSeconds: Number(config.tuneSeconds ?? 45),
      needles: {},
      locked: [],
      result: null,
    };
    startRound(state, ctx);
    return state;
  },

  action(state, playerId, action, ctx) {
    const seated = state.order.includes(playerId);
    const isBroadcaster = playerId === state.broadcasterId;

    switch (action.type) {
      case 'clue': {
        if (state.phase !== 'clue') return 'The clue is already on air.';
        if (!isBroadcaster) return 'Only the broadcaster gives the clue.';
        const text = String(action.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CLUE);
        if (!text) return 'Type a clue first.';
        if (/\d/.test(text)) return 'No numbers in the clue — that would give the spot away.';
        state.clue = text;
        state.phase = 'tune';
        state.endsAt = ctx.now + state.tuneSeconds * 1000;
        return;
      }
      case 'swap':
        if (state.phase !== 'clue' || !isBroadcaster) return 'Only the broadcaster can swap the band, before the clue.';
        if (state.swapped) return 'You can only swap once per round.';
        state.swapped = true;
        dealBand(state, ctx);
        return;
      case 'tune': {
        if (state.phase !== 'tune') return 'The dial is not open.';
        if (!seated || isBroadcaster) return 'Only the tuners move the dial.';
        if (state.locked.includes(playerId)) return 'You are already locked in.';
        const value = Number(action.value);
        if (!Number.isFinite(value)) return 'Invalid dial position.';
        state.needles[playerId] = Math.round(Math.max(0, Math.min(100, value)));
        if (action.lock) {
          state.locked.push(playerId);
          if (everyoneLocked(state, ctx)) reveal(state, ctx);
        }
        return;
      }
      case 'next':
        if (state.phase !== 'reveal') return 'Nothing to skip.';
        if (!seated) return 'Only players can move things along.';
        finishRound(state, ctx);
        return;
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.phase === 'over' || state.endsAt === null) return false;
    const timeUp = ctx.now >= state.endsAt;
    if (state.phase === 'clue' && timeUp) {
      ctx.announce('No clue went out in time, so that broadcast is skipped.');
      finishRound(state, ctx);
      return true;
    }
    if (state.phase === 'tune' && (timeUp || everyoneLocked(state, ctx))) {
      reveal(state, ctx);
      return true;
    }
    if (state.phase === 'reveal' && timeUp) {
      finishRound(state, ctx);
      return true;
    }
    return false;
  },

  addPlayer(state, player) {
    if (state.phase === 'over') return false;
    // Latecomers join the current lap, so they don't owe turns from before they arrived.
    const fewest = Math.min(...state.order.map((id) => state.turnsTaken[id] ?? 0));
    state.order.push(player.id);
    state.scores[player.id] = 0;
    state.turnsTaken[player.id] = fewest;
    return { team: null };
  },

  filterChat(state, playerId) {
    const live = state.phase === 'clue' || state.phase === 'tune';
    return live && playerId === state.broadcasterId ? 'The broadcaster stays off the chat until the reveal.' : null;
  },

  view(state, viewerId) {
    const seated = state.order.includes(viewerId);
    const role: DialView['role'] = !seated ? 'spectator' : viewerId === state.broadcasterId ? 'broadcaster' : 'tuner';
    const shown = state.phase === 'reveal' || state.phase === 'over';
    const [left, right] = BANDS[state.bandIndex];
    const best = Math.max(...state.order.map((id) => state.scores[id] ?? 0));
    return {
      phase: state.phase,
      mode: state.mode,
      order: state.order,
      scores: state.scores,
      teamScore: state.teamScore,
      round: state.round,
      totalRounds: state.round + turnsLeft(state),
      broadcasterId: state.broadcasterId,
      band: { left, right },
      clue: state.clue,
      endsAt: state.endsAt,
      phaseSeconds: state.phase === 'clue' ? state.clueSeconds : state.phase === 'tune' ? state.tuneSeconds : REVEAL_MS / 1000,
      role,
      target: shown || role === 'broadcaster' ? state.target : null,
      canSwap: role === 'broadcaster' && state.phase === 'clue' && !state.swapped,
      myNeedle: state.needles[viewerId] ?? null,
      locked: state.locked,
      result: shown ? state.result : null,
      winners: state.phase === 'over' && state.mode === 'versus' ? state.order.filter((id) => (state.scores[id] ?? 0) === best) : [],
    };
  },

  isFinished: (state) => state.phase === 'over',
};
