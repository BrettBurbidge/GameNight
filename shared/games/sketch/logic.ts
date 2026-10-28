import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import type { DrawOp, FeedItem, SketchAction, SketchView, StreamEvent, StreamSnapshot, TurnResult } from './types';
import { CANVAS_H, CANVAS_W } from './types';
import { EASY_WORDS, HARD_WORDS, MEDIUM_WORDS } from './words';

type Audience = 'all' | 'insiders' | PlayerId;

interface SketchState {
  mode: 'ffa' | 'teams';
  phase: SketchView['phase'];
  round: number;
  totalRounds: number;
  turnId: number;
  players: PlayerId[];
  teams: [PlayerId[], PlayerId[]] | null;
  activeTeam: 0 | 1;
  teamDrawerIndex: [number, number];
  turnsTaken: number;
  /** Free-for-all: this round's drawing order. */
  queue: PlayerId[];
  queuePos: number;
  drawerId: PlayerId;
  choices: string[];
  word: string | null;
  revealed: number[];
  hints: boolean;
  drawMs: number;
  phaseEndsAt: number | null;
  phaseMs: number;
  turnStartedAt: number;
  guessed: PlayerId[];
  turnPoints: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  teamScores: [number, number];
  ops: { seq: number; op: DrawOp }[];
  opSeq: number;
  feed: (FeedItem & { audience: Audience })[];
  feedSeq: number;
  lastResult: TurnResult | null;
  drawerAwaySince: number | null;
  usedWords: string[];
}

export const CHOOSE_MS = 15_000;
export const STEAL_MS = 10_000;
export const REVEAL_MS = 5_000;
export const AWAY_SKIP_MS = 10_000;
export const STEAL_POINTS = 150;
export const DRAWER_POINTS_PER_GUESS = 60;
const MAX_OPS_PER_TURN = 30_000;
const MAX_FEED = 60;

const spaced = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isCorrect(guess: string, word: string): boolean {
  const g = compact(guess);
  const w = compact(word);
  return !!g && (g === w || g === `${w}s` || g === `${w}es`);
}

/** Edit distance where swapping two adjacent letters ("appel") counts as one typo. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export function isClose(guess: string, word: string): boolean {
  const g = compact(guess);
  const w = compact(word);
  if (w.length < 4 || !g) return false;
  return editDistance(g, w) <= (w.length >= 8 ? 2 : 1);
}

/** Does a chat message give the word away? */
export function mentionsWord(text: string, word: string): boolean {
  const t = ` ${spaced(text)} `;
  const w = spaced(word);
  if ([w, `${w}s`].some((form) => t.includes(` ${form} `))) return true;
  // Catch run-together spellings ("icecream") for longer words without flagging "cat" in "category".
  return compact(word).length >= 5 && compact(text).includes(compact(word));
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function letterIndices(word: string): number[] {
  return [...word].flatMap((ch, i) => (/[a-z0-9]/i.test(ch) ? [i] : []));
}

function pushFeed(state: SketchState, item: Omit<FeedItem, 'id'>, audience: Audience = 'all') {
  state.feed.push({ ...item, id: ++state.feedSeq, audience });
  if (state.feed.length > MAX_FEED) state.feed.splice(0, state.feed.length - MAX_FEED);
}

function teamOf(state: SketchState, id: PlayerId): 0 | 1 | null {
  if (!state.teams) return null;
  if (state.teams[0].includes(id)) return 0;
  if (state.teams[1].includes(id)) return 1;
  return null;
}

function award(state: SketchState, id: PlayerId, points: number) {
  state.scores[id] = (state.scores[id] ?? 0) + points;
  state.turnPoints[id] = (state.turnPoints[id] ?? 0) + points;
}

function speedPoints(state: SketchState, now: number): number {
  const left = Math.max(0, (state.phaseEndsAt ?? now) - now) / state.drawMs;
  return 100 + Math.round(200 * left);
}

function startTurn(state: SketchState, drawerId: PlayerId, ctx: GameContext) {
  state.turnId++;
  state.drawerId = drawerId;
  state.phase = 'choosing';
  const fresh = (list: string[]) => list.filter((w) => !state.usedWords.includes(w));
  state.choices = [EASY_WORDS, MEDIUM_WORDS, HARD_WORDS].map((tier) => pick(fresh(tier).length ? fresh(tier) : tier, ctx.random));
  state.word = null;
  state.revealed = [];
  state.guessed = [];
  state.turnPoints = {};
  state.ops = [];
  state.opSeq = 0;
  state.feed = [];
  state.drawerAwaySince = null;
  state.phaseMs = CHOOSE_MS;
  state.phaseEndsAt = ctx.now + CHOOSE_MS;
}

function chooseWord(state: SketchState, index: number, ctx: GameContext) {
  state.word = state.choices[index];
  state.usedWords.push(state.word);
  state.phase = 'drawing';
  state.phaseMs = state.drawMs;
  state.phaseEndsAt = ctx.now + state.drawMs;
  state.turnStartedAt = ctx.now;
}

function endTurn(state: SketchState, reason: TurnResult['reason'], ctx: GameContext, stolenBy: 0 | 1 | null = null) {
  const word = state.word ?? state.choices[0];
  let team: TurnResult['team'] = null;
  if (state.mode === 'teams') {
    const drawing = state.activeTeam;
    const points = stolenBy !== null ? STEAL_POINTS : state.guessed.length ? Object.values(state.turnPoints)[0] ?? 0 : 0;
    team = { drawing, points, stolenBy };
  }
  state.lastResult = { word, drawerId: state.drawerId, reason, points: { ...state.turnPoints }, team };
  if (state.mode === 'teams') state.turnsTaken++;
  state.phase = 'reveal';
  state.phaseMs = REVEAL_MS;
  state.phaseEndsAt = ctx.now + REVEAL_MS;
}

/** Picks the next drawer, skipping anyone who isn't here. Returns false when the game is over. */
function advance(state: SketchState, ctx: GameContext): boolean {
  if (state.mode === 'teams') {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (state.turnsTaken >= state.totalRounds * 2) return false;
      state.activeTeam = state.activeTeam === 0 ? 1 : 0;
      state.round = Math.floor(state.turnsTaken / 2) + 1;
      const team = state.teams![state.activeTeam];
      for (let i = 0; i < team.length; i++) {
        const id = team[state.teamDrawerIndex[state.activeTeam]++ % team.length];
        if (ctx.isConnected(id)) {
          startTurn(state, id, ctx);
          return true;
        }
      }
      state.turnsTaken++; // nobody on that team is here; forfeit its turn
    }
    return false;
  }

  for (;;) {
    state.queuePos++;
    if (state.queuePos >= state.queue.length) {
      state.round++;
      if (state.round > state.totalRounds) return false;
      state.queue = state.players.filter((id) => ctx.isConnected(id));
      state.queuePos = 0;
      if (!state.queue.length) return false;
    }
    const id = state.queue[state.queuePos];
    if (ctx.isConnected(id)) {
      startTurn(state, id, ctx);
      return true;
    }
  }
}

function finish(state: SketchState, ctx: GameContext) {
  state.phase = 'over';
  state.phaseEndsAt = null;
  ctx.announce('🎨 Game over!');
}

/** Players who still need to guess for the turn to end early. */
function pendingGuessers(state: SketchState, ctx: GameContext): PlayerId[] {
  const pool = state.mode === 'teams' ? state.teams![state.activeTeam] : state.players;
  return pool.filter((id) => id !== state.drawerId && !state.guessed.includes(id) && ctx.isConnected(id));
}

function validOp(raw: unknown): DrawOp | null {
  if (!raw || typeof raw !== 'object') return null;
  const op = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
  const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  switch (op.t) {
    case 'begin': {
      const id = num(op.id, 1e9), x = num(op.x, CANVAS_W), y = num(op.y, CANVAS_H), size = num(op.size, 60), c = color(op.color);
      return id === null || x === null || y === null || !size || !c ? null : { t: 'begin', id, x, y, size, color: c };
    }
    case 'pts': {
      const id = num(op.id, 1e9);
      if (id === null || !Array.isArray(op.pts) || op.pts.length % 2 || op.pts.length > 400) return null;
      const pts = op.pts.map((v, i) => num(v, i % 2 ? CANVAS_H : CANVAS_W));
      return pts.some((v) => v === null) ? null : { t: 'pts', id, pts: pts as number[] };
    }
    case 'fill': {
      const x = num(op.x, CANVAS_W), y = num(op.y, CANVAS_H), c = color(op.color);
      return x === null || y === null || !c ? null : { t: 'fill', x, y, color: c };
    }
    case 'undo':
      return { t: 'undo' };
    case 'clear':
      return { t: 'clear' };
    default:
      return null;
  }
}

export const sketch: GameDefinition<SketchState, SketchAction, SketchView> = {
  id: 'sketch',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length < 2 ? 'You need at least 2 players.' : null;
  },

  setup(players: PlayerInfo[], config, ctx) {
    const active = players.filter((p) => !p.spectator);
    const mode = config.mode === 'teams' && active.length >= 4 ? 'teams' : 'ffa';
    let teams: [PlayerId[], PlayerId[]] | null = null;
    if (mode === 'teams') {
      teams = [[], []];
      for (const p of active) if (p.team === 0 || p.team === 1) teams[p.team].push(p.id);
      for (const p of active) if (p.team !== 0 && p.team !== 1) teams[teams[0].length <= teams[1].length ? 0 : 1].push(p.id);
      while (teams[0].length < 2 && teams[1].length > 2) teams[0].push(teams[1].pop()!);
      while (teams[1].length < 2 && teams[0].length > 2) teams[1].push(teams[0].pop()!);
      teams = [shuffle(teams[0], ctx.random), shuffle(teams[1], ctx.random)];
    }
    const ids = active.map((p) => p.id);
    const state: SketchState = {
      mode,
      phase: 'choosing',
      round: 1,
      totalRounds: Number(config.rounds ?? 3),
      turnId: 0,
      players: ids,
      teams,
      activeTeam: ctx.random() < 0.5 ? 0 : 1,
      teamDrawerIndex: [0, 0],
      turnsTaken: 0,
      queue: shuffle(ids, ctx.random),
      queuePos: -1,
      drawerId: '',
      choices: [],
      word: null,
      revealed: [],
      hints: config.hints !== 'off',
      drawMs: Number(config.drawSeconds ?? 80) * 1000,
      phaseEndsAt: null,
      phaseMs: CHOOSE_MS,
      turnStartedAt: ctx.now,
      guessed: [],
      turnPoints: {},
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      teamScores: [0, 0],
      ops: [],
      opSeq: 0,
      feed: [],
      feedSeq: 0,
      lastResult: null,
      drawerAwaySince: null,
      usedWords: [],
    };
    if (mode === 'teams') {
      // advance() flips to the other team before picking a drawer.
      state.activeTeam = state.activeTeam === 0 ? 1 : 0;
      advance(state, ctx);
    } else {
      state.queuePos = 0;
      startTurn(state, state.queue[0], ctx);
    }
    return state;
  },

  action(state, playerId, action, ctx) {
    switch (action.type) {
      case 'choose': {
        if (state.phase !== 'choosing') return 'The word has already been picked.';
        if (playerId !== state.drawerId) return 'Only the drawer picks the word.';
        if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.choices.length) return 'Pick one of the words.';
        chooseWord(state, action.index, ctx);
        return;
      }
      case 'guess': {
        const text = String(action.text ?? '').trim().slice(0, 60);
        if (!text) return;
        const word = state.word;
        if (!word || (state.phase !== 'drawing' && state.phase !== 'steal')) return 'Wait for the next drawing.';
        if (playerId === state.drawerId) return 'You’re the one drawing!';
        const myTeam = teamOf(state, playerId);
        if (!state.players.includes(playerId)) return 'Spectators can’t guess.';

        if (state.phase === 'steal') {
          if (myTeam === state.activeTeam) return 'Time’s up for your team — the other team is trying to steal.';
          if (isCorrect(text, word)) {
            state.teamScores[myTeam!] += STEAL_POINTS;
            pushFeed(state, { kind: 'steal', playerId, text: `stole it for ${STEAL_POINTS} points!` });
            endTurn(state, 'stolen', ctx, myTeam);
          } else {
            pushFeed(state, { kind: 'guess', playerId, text });
            if (isClose(text, word)) pushFeed(state, { kind: 'close', playerId, text: `“${text}” is close!` }, playerId);
          }
          return;
        }

        if (state.mode === 'teams' && myTeam !== state.activeTeam) return 'Watch closely — you may get a chance to steal!';
        if (state.guessed.includes(playerId)) {
          // Already solved: chat only with others who know the word.
          if (mentionsWord(text, word)) return 'No spoilers!';
          pushFeed(state, { kind: 'insider', playerId, text }, 'insiders');
          return;
        }
        if (isCorrect(text, word)) {
          const points = speedPoints(state, ctx.now);
          state.guessed.push(playerId);
          award(state, playerId, points);
          if (state.mode === 'teams') {
            state.teamScores[state.activeTeam] += points;
            pushFeed(state, { kind: 'correct', playerId, text: `guessed it! +${points}` });
            endTurn(state, 'all-guessed', ctx);
            return;
          }
          award(state, state.drawerId, DRAWER_POINTS_PER_GUESS);
          pushFeed(state, { kind: 'correct', playerId, text: 'guessed the word!' });
          if (pendingGuessers(state, ctx).length === 0) endTurn(state, 'all-guessed', ctx);
          return;
        }
        pushFeed(state, { kind: 'guess', playerId, text });
        if (isClose(text, word)) pushFeed(state, { kind: 'close', playerId, text: `“${text}” is close!` }, playerId);
        return;
      }
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.phase === 'over') return false;
    const now = ctx.now;

    // A drawer who leaves mid-turn gets skipped after a grace period.
    if (state.phase === 'choosing' || state.phase === 'drawing') {
      if (!ctx.isConnected(state.drawerId)) {
        state.drawerAwaySince ??= now;
        if (now - state.drawerAwaySince >= AWAY_SKIP_MS) {
          endTurn(state, 'skipped', ctx);
          return true;
        }
      } else {
        state.drawerAwaySince = null;
      }
    }

    if (state.phase === 'choosing' && now >= state.phaseEndsAt!) {
      chooseWord(state, Math.floor(ctx.random() * state.choices.length), ctx);
      return true;
    }

    if (state.phase === 'drawing') {
      let changed = false;
      if (state.hints && state.word) {
        const letters = letterIndices(state.word);
        const maxReveal = Math.min(3, Math.floor(letters.length / 2));
        const elapsed = (now - state.turnStartedAt) / state.drawMs;
        const due = Math.min(maxReveal, [0.4, 0.6, 0.8].filter((f) => elapsed >= f).length);
        while (state.revealed.length < due) {
          const hidden = letters.filter((i) => !state.revealed.includes(i));
          state.revealed.push(pick(hidden, ctx.random));
          changed = true;
        }
      }
      if (now >= state.phaseEndsAt!) {
        const stealers = state.mode === 'teams' ? state.teams![state.activeTeam === 0 ? 1 : 0].filter((id) => ctx.isConnected(id)) : [];
        if (stealers.length) {
          state.phase = 'steal';
          state.phaseMs = STEAL_MS;
          state.phaseEndsAt = now + STEAL_MS;
        } else {
          endTurn(state, 'time', ctx);
        }
        return true;
      }
      return changed;
    }

    if (state.phase === 'steal' && now >= state.phaseEndsAt!) {
      endTurn(state, 'time', ctx);
      return true;
    }

    if (state.phase === 'reveal' && now >= state.phaseEndsAt!) {
      if (!advance(state, ctx)) finish(state, ctx);
      return true;
    }
    return false;
  },

  stream(state, playerId, data) {
    if (state.phase !== 'drawing' || playerId !== state.drawerId) return null;
    if (state.ops.length >= MAX_OPS_PER_TURN) return null;
    const op = validOp(data);
    if (!op) return null;
    const entry = { seq: ++state.opSeq, op };
    state.ops.push(entry);
    const event: StreamEvent = { turnId: state.turnId, ...entry };
    return event;
  },

  streamSync(state): StreamSnapshot {
    return { turnId: state.turnId, ops: state.ops };
  },

  filterChat(state, _playerId, text) {
    if (state.word && (state.phase === 'drawing' || state.phase === 'steal') && mentionsWord(text, state.word)) {
      return 'No spoilers! That message contains the word.';
    }
    return null;
  },

  addPlayer(state, player) {
    if (!state.players.includes(player.id)) state.players.push(player.id);
    state.scores[player.id] ??= 0;
    if (state.mode === 'teams') {
      const t: 0 | 1 = state.teams![0].length <= state.teams![1].length ? 0 : 1;
      state.teams![t].push(player.id);
      return { team: t };
    }
    return { team: null };
  },

  view(state, viewerId) {
    const isDrawer = viewerId === state.drawerId;
    const myTeam = teamOf(state, viewerId);
    const seated = state.players.includes(viewerId);
    const hasGuessed = state.guessed.includes(viewerId);
    const revealedToAll = state.phase === 'reveal' || state.phase === 'over';
    const knowsWord = isDrawer || revealedToAll || (state.mode === 'ffa' && hasGuessed);
    const insider = isDrawer || hasGuessed || revealedToAll;

    let role: SketchView['role'];
    if (!seated) role = 'spectator';
    else if (isDrawer) role = 'drawer';
    else if (state.mode === 'teams' && myTeam !== state.activeTeam) role = state.phase === 'steal' ? 'stealer' : 'watcher';
    else role = hasGuessed ? 'guessed' : 'guesser';

    const mask =
      state.word && !knowsWord
        ? [...state.word].map((ch, i) => (/[a-z0-9]/i.test(ch) ? (state.revealed.includes(i) ? ch : null) : ch))
        : null;

    let winners: PlayerId[] = [];
    let winningTeam: SketchView['winningTeam'] = null;
    if (state.phase === 'over') {
      if (state.mode === 'teams') {
        const [a, b] = state.teamScores;
        winningTeam = a === b ? 'tie' : a > b ? 0 : 1;
      } else {
        const top = Math.max(...state.players.map((id) => state.scores[id] ?? 0));
        winners = state.players.filter((id) => (state.scores[id] ?? 0) === top);
      }
    }

    return {
      mode: state.mode,
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      turnId: state.turnId,
      drawerId: state.drawerId,
      players: state.players,
      teams: state.teams,
      activeTeam: state.activeTeam,
      choices: isDrawer && state.phase === 'choosing' ? state.choices : null,
      word: knowsWord ? state.word ?? (revealedToAll ? state.lastResult?.word ?? null : null) : null,
      mask,
      phaseEndsAt: state.phaseEndsAt,
      phaseMs: state.phaseMs,
      guessed: state.guessed,
      scores: state.scores,
      teamScores: state.teamScores,
      feed: state.feed
        .filter((f) => f.audience === 'all' || (f.audience === 'insiders' ? insider : f.audience === viewerId))
        .map(({ audience: _a, ...item }) => item),
      role,
      lastResult: state.lastResult,
      winners,
      winningTeam,
    };
  },

  isFinished: (state) => state.phase === 'over',
};
