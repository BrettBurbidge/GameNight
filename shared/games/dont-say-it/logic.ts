import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import type { CardResult, FeedItem, DontSayItAction, DontSayItView, TurnSummary } from './types';
import { WORD_CARDS } from './words';

interface DontSayItState {
  phase: 'ready' | 'turn' | 'over';
  /** Under 4 players everyone shares team 0 and takes turns giving clues. */
  mode: 'teams' | 'coop';
  teams: [PlayerId[], PlayerId[]];
  scores: [number, number];
  activeTeam: 0 | 1;
  giverIndex: [number, number];
  giverId: PlayerId;
  turnEndsAt: number | null;
  turnSeconds: number;
  turnsTaken: number;
  totalTurns: number;
  skipPenalty: number;
  deck: number[];
  deckPos: number;
  cardIndex: number | null;
  cardSeq: number;
  feed: FeedItem[];
  feedSeq: number;
  results: { word: string; result: CardResult }[];
  lastTurn: TurnSummary | null;
  lastEvent: DontSayItView['lastEvent'];
}

const MAX_FEED = 60;
const COOP_BELOW = 4;

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string) => words(s).replace(/ /g, '');

/** "is it a pizza?" matches "Pizza"; "pizzas" too. */
export function isCorrectGuess(guess: string, secret: string): boolean {
  const g = ` ${words(guess)} `;
  const w = words(secret);
  if (!w) return false;
  if (compact(guess) === compact(secret)) return true;
  return [w, `${w}s`, `${w}es`].some((form) => g.includes(` ${form} `));
}

/** "cheese" -> "chees" so "cheesy" is caught too. Short words are left alone. */
const stem = (w: string) => {
  const s = w.replace(/(ing|ed|es|s|e|y)$/, '');
  return s.length >= 4 ? s : w;
};

/** Returns the forbidden word a typed clue uses (secret or forbidden, incl. simple word forms), if any. */
export function findForbiddenHit(clue: string, secret: string, banned: string[]): string | null {
  const tokens = words(clue).split(' ').filter(Boolean);
  const joined = ` ${tokens.join(' ')} `;
  const flat = tokens.join('');
  for (const forbidden of [secret, ...banned]) {
    const f = words(forbidden);
    if (!f) continue;
    if (f.includes(' ')) {
      if (joined.includes(` ${f} `) || flat.includes(f.replace(/ /g, ''))) return forbidden;
    } else if (tokens.some((t) => t === f || (f.length >= 3 && t.startsWith(stem(f))))) {
      return forbidden;
    }
  }
  return null;
}

function drawCard(state: DontSayItState, ctx: GameContext) {
  if (state.deckPos >= state.deck.length) {
    state.deck = shuffle(WORD_CARDS.map((_, i) => i), ctx.random);
    state.deckPos = 0;
  }
  state.cardIndex = state.deck[state.deckPos++];
  state.cardSeq++;
}

function pushFeed(state: DontSayItState, item: Omit<FeedItem, 'id'>) {
  state.feed.push({ ...item, id: ++state.feedSeq });
  if (state.feed.length > MAX_FEED) state.feed.splice(0, state.feed.length - MAX_FEED);
}

function resolveCard(state: DontSayItState, result: CardResult, by: PlayerId | null, ctx: GameContext) {
  if (state.cardIndex === null) return;
  const word = WORD_CARDS[state.cardIndex][0];
  const delta = result === 'correct' ? 1 : result === 'forbidden' ? -1 : -state.skipPenalty;
  state.scores[state.activeTeam] += delta;
  state.results.push({ word, result });
  state.lastEvent = { kind: result, word, seq: state.cardSeq, by };
  const label = result === 'correct' ? `✅ ${word}` : result === 'forbidden' ? `🚨 Forbidden word! (${word})` : `⏭️ Skipped ${word}`;
  pushFeed(state, { kind: result, playerId: by, text: label });
  drawCard(state, ctx);
}

function teamOf(state: DontSayItState, id: PlayerId): 0 | 1 | null {
  if (state.teams[0].includes(id)) return 0;
  if (state.teams[1].includes(id)) return 1;
  return null;
}

function currentGiver(state: DontSayItState, team: 0 | 1): PlayerId {
  const members = state.teams[team];
  return members[state.giverIndex[team] % members.length];
}

function endTurn(state: DontSayItState, ctx: GameContext) {
  const points = state.results.reduce(
    (sum, r) => sum + (r.result === 'correct' ? 1 : r.result === 'forbidden' ? -1 : -state.skipPenalty),
    0,
  );
  state.lastTurn = { team: state.activeTeam, giverId: state.giverId, results: state.results, points };
  state.giverIndex[state.activeTeam]++;
  state.turnsTaken++;
  state.cardIndex = null;
  state.turnEndsAt = null;
  if (state.turnsTaken >= state.totalTurns) {
    state.phase = 'over';
    const [a, b] = state.scores;
    if (state.mode === 'coop') ctx.announce(`Game over! You scored ${a} together.`);
    else ctx.announce(a === b ? `It's a tie, ${a}–${b}!` : `Game over! Final score ${a}–${b}.`);
    return;
  }
  if (state.mode === 'teams') state.activeTeam = state.activeTeam === 0 ? 1 : 0;
  state.giverId = currentGiver(state, state.activeTeam);
  state.phase = 'ready';
}

export const dontSayIt: GameDefinition<DontSayItState, DontSayItAction, DontSayItView> = {
  id: 'dont-say-it',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length < 2 ? 'You need at least 2 players.' : null;
  },

  setup(players: PlayerInfo[], config, ctx) {
    const teams: [PlayerId[], PlayerId[]] = [[], []];
    const active = players.filter((p) => !p.spectator);
    const mode = active.length < COOP_BELOW ? 'coop' : 'teams';
    if (mode === 'coop') teams[0].push(...active.map((p) => p.id));
    else for (const p of active) if (p.team === 0 || p.team === 1) teams[p.team].push(p.id);
    for (const p of mode === 'coop' ? [] : active) {
      if (p.team !== 0 && p.team !== 1) teams[teams[0].length <= teams[1].length ? 0 : 1].push(p.id);
    }
    // Rebalance so neither team is left without a guesser.
    while (teams[0].length < 2 && teams[1].length > 2) teams[0].push(teams[1].pop()!);
    while (teams[1].length < 2 && teams[0].length > 2) teams[1].push(teams[0].pop()!);

    const rounds = Number(config.rounds ?? 4);
    const activeTeam: 0 | 1 = mode === 'coop' || ctx.random() < 0.5 ? 0 : 1;
    const state: DontSayItState = {
      phase: 'ready',
      mode,
      teams: [shuffle(teams[0], ctx.random), shuffle(teams[1], ctx.random)],
      scores: [0, 0],
      activeTeam,
      giverIndex: [0, 0],
      giverId: '',
      turnEndsAt: null,
      turnSeconds: Number(config.turnSeconds ?? 60),
      turnsTaken: 0,
      totalTurns: rounds * 2,
      skipPenalty: Number(config.skipPenalty ?? 1),
      deck: shuffle(WORD_CARDS.map((_, i) => i), ctx.random),
      deckPos: 0,
      cardIndex: null,
      cardSeq: 0,
      feed: [],
      feedSeq: 0,
      results: [],
      lastTurn: null,
      lastEvent: null,
    };
    state.giverId = currentGiver(state, activeTeam);
    return state;
  },

  action(state, playerId, action, ctx) {
    const team = teamOf(state, playerId);
    const isGiver = playerId === state.giverId;

    switch (action.type) {
      case 'start-turn': {
        if (state.phase !== 'ready') return 'The turn has already started.';
        if (!isGiver) {
          if (!action.takeOver || team !== state.activeTeam) return 'Only the clue giver can start the turn.';
          state.giverId = playerId;
          state.giverIndex[state.activeTeam] = state.teams[state.activeTeam].indexOf(playerId);
        }
        state.phase = 'turn';
        state.turnEndsAt = ctx.now + state.turnSeconds * 1000;
        state.results = [];
        state.feed = [];
        state.lastEvent = null;
        drawCard(state, ctx);
        return;
      }
      case 'guess': {
        if (state.phase !== 'turn' || state.cardIndex === null) return 'No card in play.';
        if (team !== state.activeTeam || isGiver) return 'Only your teammates can guess.';
        const text = action.text.trim().slice(0, 80);
        if (!text) return;
        if (isCorrectGuess(text, WORD_CARDS[state.cardIndex][0])) {
          resolveCard(state, 'correct', playerId, ctx);
        } else {
          pushFeed(state, { kind: 'guess', playerId, text });
        }
        return;
      }
      case 'clue': {
        if (state.phase !== 'turn' || state.cardIndex === null) return 'No card in play.';
        if (!isGiver) return 'Only the clue giver can give clues.';
        const text = action.text.trim().slice(0, 120);
        if (!text) return;
        const [secret, ...forbiddenWords] = WORD_CARDS[state.cardIndex];
        pushFeed(state, { kind: 'clue', playerId, text });
        const hit = findForbiddenHit(text, secret, forbiddenWords);
        if (hit) resolveCard(state, 'forbidden', null, ctx);
        return;
      }
      case 'correct':
        if (state.phase !== 'turn') return 'No card in play.';
        if (!isGiver) return 'Only the clue giver can mark a card correct.';
        resolveCard(state, 'correct', playerId, ctx);
        return;
      case 'skip':
        if (state.phase !== 'turn') return 'No card in play.';
        if (!isGiver) return 'Only the clue giver can skip.';
        resolveCard(state, 'skip', playerId, ctx);
        return;
      case 'buzz':
        if (state.phase !== 'turn') return 'No card in play.';
        if (team === null || team === state.activeTeam) return 'Only the other team can buzz.';
        resolveCard(state, 'forbidden', playerId, ctx);
        return;
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.phase === 'turn' && state.turnEndsAt !== null && ctx.now >= state.turnEndsAt) {
      endTurn(state, ctx);
      return true;
    }
    return false;
  },

  addPlayer(state, player) {
    const t: 0 | 1 = state.mode === 'coop' || state.teams[0].length <= state.teams[1].length ? 0 : 1;
    state.teams[t].push(player.id);
    return { team: t };
  },

  view(state, viewerId) {
    const team = teamOf(state, viewerId);
    const role: DontSayItView['role'] =
      team === null ? 'spectator' : viewerId === state.giverId ? 'giver' : team === state.activeTeam ? 'guesser' : 'watcher';
    const seesCard = state.phase === 'turn' && (role === 'giver' || role === 'watcher' || role === 'spectator');
    const card =
      seesCard && state.cardIndex !== null
        ? { word: WORD_CARDS[state.cardIndex][0], forbidden: WORD_CARDS[state.cardIndex].slice(1) }
        : null;
    const [a, b] = state.scores;
    return {
      phase: state.phase,
      mode: state.mode,
      teams: state.teams,
      scores: state.scores,
      activeTeam: state.activeTeam,
      giverId: state.giverId,
      turnEndsAt: state.turnEndsAt,
      turnSeconds: state.turnSeconds,
      turnsTaken: state.turnsTaken,
      totalTurns: state.totalTurns,
      card,
      cardSeq: state.cardSeq,
      role,
      feed: state.feed,
      results: state.results,
      lastTurn: state.lastTurn,
      lastEvent: state.lastEvent,
      winner: state.phase !== 'over' || state.mode === 'coop' ? null : a === b ? 'tie' : a > b ? 0 : 1,
    };
  },

  isFinished: (state) => state.phase === 'over',
};
