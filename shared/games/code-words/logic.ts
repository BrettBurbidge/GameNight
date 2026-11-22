import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import { findWordHit } from '../../words';
import type { CodeWordsAction, CodeWordsView, Picks, RoundResult, Slot } from './types';
import { BOARD_WORDS } from './words';

interface CodeWordsState {
  phase: 'clue' | 'guess' | 'reveal' | 'over';
  board: string[];
  claimed: (0 | 1 | null)[];
  teams: [PlayerId[], PlayerId[]];
  /** Rotates one seat per round so everyone takes a turn as cipher. */
  cipherIndex: [number, number];
  cipherIds: [PlayerId, PlayerId];
  targets: [number, number];
  clues: [string | null, string | null];
  picks: Record<PlayerId, Picks>;
  locked: PlayerId[];
  scores: [number, number];
  round: number;
  totalRounds: number;
  clueSeconds: number;
  guessSeconds: number;
  endsAt: number | null;
  result: RoundResult | null;
}

export const BOARD_SIZE = 20;
export const CRACK_POINTS = 2;
export const INTERCEPT_POINTS = 1;
const MAX_CLUE_WORDS = 2;
const MAX_CLUE = 32;
const REVEAL_MS = 20_000;

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const teamOf = (state: CodeWordsState, id: PlayerId): 0 | 1 | null =>
  state.teams[0].includes(id) ? 0 : state.teams[1].includes(id) ? 1 : null;

const guessersOf = (state: CodeWordsState, team: 0 | 1) => state.teams[team].filter((id) => id !== state.cipherIds[team]);

/** The next teammate due a turn as cipher, skipping anyone who has dropped off the call. */
function cipherFor(state: CodeWordsState, team: 0 | 1, ctx: GameContext): PlayerId {
  const members = state.teams[team];
  for (let step = 0; step < members.length; step++) {
    const id = members[(state.cipherIndex[team] + step) % members.length];
    if (ctx.isConnected(id)) return id;
  }
  return members[state.cipherIndex[team] % members.length];
}

/**
 * What the team goes with: the word most of its guessers picked.
 * Ties go to whoever locked in first, so an early commit breaks a deadlock.
 */
function plurality(state: CodeWordsState, ids: PlayerId[], slot: Slot): number | null {
  const ordered = [...state.locked.filter((id) => ids.includes(id)), ...ids.filter((id) => !state.locked.includes(id))];
  const counts = new Map<number, number>();
  for (const id of ordered) {
    const value = state.picks[id]?.[slot];
    if (value === null || value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) [best, bestCount] = [value, count];
  }
  return best;
}

function openGuessing(state: CodeWordsState, ctx: GameContext) {
  if (state.clues[0] === null && state.clues[1] === null) return resolve(state, ctx);
  state.phase = 'guess';
  state.endsAt = ctx.now + state.guessSeconds * 1000;
}

function resolve(state: CodeWordsState, ctx: GameContext) {
  const answers = ([0, 1] as const).map((t) => {
    const ids = guessersOf(state, t);
    return { crack: plurality(state, ids, 'crack'), intercept: plurality(state, ids, 'intercept') };
  }) as [Picks, Picks];

  const cracked = ([0, 1] as const).map((t) => state.clues[t] !== null && answers[t].crack === state.targets[t]) as [boolean, boolean];
  const intercepted = ([0, 1] as const).map((t) => {
    const other = t === 0 ? 1 : 0;
    return state.clues[other] !== null && answers[t].intercept === state.targets[other];
  }) as [boolean, boolean];
  const gained = ([0, 1] as const).map(
    (t) => (cracked[t] ? CRACK_POINTS : 0) + (intercepted[t] ? INTERCEPT_POINTS : 0),
  ) as [number, number];

  state.scores = [state.scores[0] + gained[0], state.scores[1] + gained[1]];
  state.claimed[state.targets[0]] = 0;
  state.claimed[state.targets[1]] = 1;
  state.result = { round: state.round, clues: state.clues, targets: state.targets, answers, cracked, intercepted, gained };
  state.phase = 'reveal';
  state.endsAt = ctx.now + REVEAL_MS;
}

function startRound(state: CodeWordsState, ctx: GameContext) {
  const free = state.board.map((_, i) => i).filter((i) => state.claimed[i] === null);
  if (free.length < 2) {
    state.phase = 'over';
    state.endsAt = null;
    return;
  }
  const [a, b] = shuffle(free, ctx.random);
  state.phase = 'clue';
  state.cipherIds = [cipherFor(state, 0, ctx), cipherFor(state, 1, ctx)];
  state.targets = [a, b];
  state.clues = [null, null];
  state.picks = {};
  state.locked = [];
  state.result = null;
  state.endsAt = ctx.now + state.clueSeconds * 1000;
}

function nextRound(state: CodeWordsState, ctx: GameContext) {
  state.cipherIndex = [state.cipherIndex[0] + 1, state.cipherIndex[1] + 1];
  state.round++;
  if (state.round >= state.totalRounds) {
    state.phase = 'over';
    state.endsAt = null;
    const [a, b] = state.scores;
    ctx.announce(a === b ? `Transmission over — ${a}–${b}, a dead heat.` : `Transmission over! Final score ${a}–${b}.`);
    return;
  }
  startRound(state, ctx);
}

/** True once every guesser who is still here has committed. */
function everyoneLocked(state: CodeWordsState, ctx: GameContext) {
  const here = [...guessersOf(state, 0), ...guessersOf(state, 1)].filter((id) => ctx.isConnected(id));
  return here.length > 0 && here.every((id) => state.locked.includes(id));
}

export const codeWords: GameDefinition<CodeWordsState, CodeWordsAction, CodeWordsView> = {
  id: 'code-words',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length < 4 ? 'Code Words needs at least 4 players, two per team.' : null;
  },

  setup(players: PlayerInfo[], config, ctx) {
    const active = players.filter((p) => !p.spectator);
    const teams: [PlayerId[], PlayerId[]] = [[], []];
    for (const p of active) if (p.team === 0 || p.team === 1) teams[p.team].push(p.id);
    for (const p of active) {
      if (p.team !== 0 && p.team !== 1) teams[teams[0].length <= teams[1].length ? 0 : 1].push(p.id);
    }
    // Every team needs a cipher plus someone to guess.
    while (teams[0].length < 2 && teams[1].length > 2) teams[0].push(teams[1].pop()!);
    while (teams[1].length < 2 && teams[0].length > 2) teams[1].push(teams[0].pop()!);

    const state: CodeWordsState = {
      phase: 'clue',
      board: shuffle(BOARD_WORDS, ctx.random).slice(0, BOARD_SIZE),
      claimed: Array.from({ length: BOARD_SIZE }, () => null),
      teams: [shuffle(teams[0], ctx.random), shuffle(teams[1], ctx.random)],
      cipherIndex: [0, 0],
      cipherIds: [teams[0][0], teams[1][0]],
      targets: [0, 1],
      clues: [null, null],
      picks: {},
      locked: [],
      scores: [0, 0],
      round: 0,
      totalRounds: Number(config.rounds ?? 6),
      clueSeconds: Number(config.clueSeconds ?? 75),
      guessSeconds: Number(config.guessSeconds ?? 75),
      endsAt: null,
      result: null,
    };
    startRound(state, ctx);
    return state;
  },

  action(state, playerId, action, ctx) {
    const team = teamOf(state, playerId);
    if (team === null) return 'Only players can do that.';
    const isCipher = state.cipherIds[team] === playerId;

    switch (action.type) {
      case 'clue': {
        if (state.phase !== 'clue') return 'The clues are already out.';
        if (!isCipher) return 'Only this round’s cipher sends the clue.';
        if (state.clues[team] !== null) return 'Your clue is already sent.';
        const text = String(action.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CLUE);
        if (!text) return 'Type a clue first.';
        if (/\d/.test(text)) return 'No numbers in a clue.';
        if (text.split(' ').length > MAX_CLUE_WORDS) return 'Two words at most.';
        const hit = findWordHit(text, state.board);
        if (hit) return `“${hit}” is on the board — you’ll have to go around it.`;
        state.clues[team] = text;
        if (state.clues[0] !== null && state.clues[1] !== null) openGuessing(state, ctx);
        return;
      }
      case 'pick': {
        if (state.phase !== 'guess') return 'There is nothing to guess yet.';
        if (isCipher) return 'You sent the clue — the rest is up to your team.';
        if (state.locked.includes(playerId)) return 'You are already locked in.';
        const index = action.wordIndex;
        if (index !== null) {
          if (!Number.isInteger(index) || index < 0 || index >= state.board.length) return 'That word is not on the board.';
          if (state.claimed[index] !== null) return 'That word has already been played.';
        }
        const mine = state.picks[playerId] ?? { crack: null, intercept: null };
        state.picks[playerId] = { ...mine, [action.slot]: index };
        return;
      }
      case 'lock':
        if (state.phase !== 'guess') return 'There is nothing to lock in.';
        if (isCipher) return 'You sent the clue — the rest is up to your team.';
        if (state.locked.includes(playerId)) return 'You are already locked in.';
        state.locked.push(playerId);
        if (everyoneLocked(state, ctx)) resolve(state, ctx);
        return;
      case 'next':
        if (state.phase !== 'reveal' || action.round !== state.round) return;
        nextRound(state, ctx);
        return;
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.phase === 'over' || state.endsAt === null) return false;
    if (state.phase === 'guess' && everyoneLocked(state, ctx)) {
      resolve(state, ctx);
      return true;
    }
    if (ctx.now < state.endsAt) return false;
    if (state.phase === 'clue') openGuessing(state, ctx);
    else if (state.phase === 'guess') resolve(state, ctx);
    else nextRound(state, ctx);
    return true;
  },

  addPlayer(state, player) {
    if (state.phase === 'over') return false;
    const team: 0 | 1 = state.teams[0].length <= state.teams[1].length ? 0 : 1;
    state.teams[team].push(player.id);
    return { team };
  },

  filterChat(state, playerId) {
    const live = state.phase === 'clue' || state.phase === 'guess';
    const team = teamOf(state, playerId);
    return live && team !== null && state.cipherIds[team] === playerId
      ? 'Ciphers stay off the air until the reveal.'
      : null;
  },

  view(state, viewerId) {
    const team = teamOf(state, viewerId);
    const isCipher = team !== null && state.cipherIds[team] === viewerId;
    const shown = state.phase === 'reveal' || state.phase === 'over';

    const tally: CodeWordsView['tally'] = { crack: {}, intercept: {} };
    if (team !== null && state.phase === 'guess') {
      for (const id of guessersOf(state, team)) {
        for (const slot of ['crack', 'intercept'] as Slot[]) {
          const value = state.picks[id]?.[slot];
          if (value === null || value === undefined) continue;
          tally[slot][value] = (tally[slot][value] ?? 0) + 1;
        }
      }
    }

    const [a, b] = state.scores;
    return {
      phase: state.phase,
      board: state.board,
      claimed: state.claimed,
      teams: state.teams,
      cipherIds: state.cipherIds,
      scores: state.scores,
      round: state.round,
      totalRounds: state.totalRounds,
      myTeam: team,
      role: team === null ? 'spectator' : isCipher ? 'cipher' : 'guesser',
      myTarget: isCipher && !shown ? state.targets[team] : null,
      // Clues land together, so until then you only ever see your own.
      clues:
        state.phase === 'clue'
          ? [isCipher && team === 0 ? state.clues[0] : null, isCipher && team === 1 ? state.clues[1] : null]
          : state.clues,
      clueSent: [state.clues[0] !== null, state.clues[1] !== null],
      myPicks: state.picks[viewerId] ?? { crack: null, intercept: null },
      tally,
      locked: state.locked,
      endsAt: state.endsAt,
      phaseSeconds:
        state.phase === 'clue' ? state.clueSeconds : state.phase === 'guess' ? state.guessSeconds : REVEAL_MS / 1000,
      result: shown ? state.result : null,
      winner: state.phase !== 'over' ? null : a === b ? 'tie' : a > b ? 0 : 1,
    };
  },

  isFinished: (state) => state.phase === 'over',
};
