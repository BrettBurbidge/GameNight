import { compactOps, validOp, type DrawOp } from '../../drawing';
import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import { EASY_WORDS, HARD_WORDS, MEDIUM_WORDS } from '../sketch/words';
import type { ChainAction, ChainSync, ChainView, RevealPage } from './types';

type Entry =
  | { kind: 'word' | 'guess'; by: PlayerId; text: string; missed: boolean }
  | { kind: 'draw'; by: PlayerId; ops: DrawOp[]; missed: boolean };

interface Book {
  owner: PlayerId;
  entries: Entry[];
}

interface ChainState {
  phase: ChainView['phase'];
  step: number;
  steps: number;
  /** Seat order; `books[i]` belongs to `players[i]`. */
  players: PlayerId[];
  books: Book[];
  custom: boolean;
  choices: Record<PlayerId, string[]>;
  prompts: Record<PlayerId, string>;
  /** This step's drawings in progress, straight off each player's canvas. */
  work: Record<PlayerId, { ops: { seq: number; op: DrawOp }[]; seq: number; points: number }>;
  /** This step's guesses in progress. */
  guesses: Record<PlayerId, string>;
  done: PlayerId[];
  drawMs: number;
  guessMs: number;
  phaseEndsAt: number | null;
  phaseMs: number;
  /** When each missing player was first seen gone. */
  awaySince: Record<PlayerId, number>;
  reveal: { book: number; page: number; shownAt: number };
  usedWords: string[];
}

export const PROMPT_MS = 30_000;
export const PROMPT_CUSTOM_MS = 60_000;
/** A player gone this long is no longer waited for. */
export const AWAY_MS = 10_000;
/** How long a page stays up at the reveal when the book's owner isn't there to flip it. */
export const AUTO_FLIP_MS = 6_000;
export const MAX_STEPS = 8;
export const MAX_TEXT = 60;
const MAX_OPS = 5_000;
const MAX_POINTS = 12_000;

/** How many times each book is passed: always even, so every book ends on a guess. */
export function stepsFor(players: number): number {
  const full = players % 2 ? players - 1 : players;
  return Math.min(full, MAX_STEPS);
}

/**
 * Which seat has book `book` at `step`. With an odd table the owner passes straight away;
 * with an even one they draw their own word first, which is what keeps the last page a guess.
 */
export function holderSeat(book: number, step: number, players: number): number {
  return (book + step - (players % 2 ? 0 : 1)) % players;
}

const clean = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

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

/** The book in front of a player this step. */
function bookOf(state: ChainState, playerId: PlayerId): Book | null {
  const seat = state.players.indexOf(playerId);
  if (seat < 0 || state.step < 1) return null;
  const n = state.players.length;
  return state.books.find((_, i) => holderSeat(i, state.step, n) === seat) ?? null;
}

/** The most recent words in a book: what the next drawer draws. */
function lastText(book: Book): string {
  for (let i = book.entries.length - 1; i >= 0; i--) {
    const e = book.entries[i];
    if (e.kind !== 'draw') return e.text;
  }
  return '';
}

function isAway(state: ChainState, id: PlayerId, ctx: GameContext): boolean {
  if (ctx.isConnected(id)) return false;
  return ctx.now - (state.awaySince[id] ?? ctx.now) >= AWAY_MS;
}

function startStep(state: ChainState, ctx: GameContext) {
  state.step++;
  state.phase = state.step % 2 ? 'draw' : 'guess';
  state.work = {};
  state.guesses = {};
  state.done = [];
  state.phaseMs = state.phase === 'draw' ? state.drawMs : state.guessMs;
  state.phaseEndsAt = ctx.now + state.phaseMs;
}

function closePrompts(state: ChainState, ctx: GameContext) {
  state.books = state.players.map((id) => {
    const chosen = state.prompts[id];
    const text = chosen ?? pick(state.choices[id], ctx.random);
    state.usedWords.push(...state.choices[id].filter((w) => w === text));
    return { owner: id, entries: [{ kind: 'word', by: id, text, missed: !chosen }] };
  });
  startStep(state, ctx);
}

/** Files everyone's work into the books and moves on. */
function closeStep(state: ChainState, ctx: GameContext) {
  const n = state.players.length;
  state.books.forEach((book, i) => {
    const by = state.players[holderSeat(i, state.step, n)];
    if (state.phase === 'draw') {
      const ops = compactOps((state.work[by]?.ops ?? []).map((o) => o.op));
      book.entries.push({ kind: 'draw', by, ops, missed: ops.length === 0 });
    } else {
      // A missing guess repeats the words before it, so the next drawer still has something to draw.
      const text = state.guesses[by] ?? '';
      book.entries.push({ kind: 'guess', by, text: text || lastText(book), missed: !text });
    }
  });
  if (state.step < state.steps) return startStep(state, ctx);
  state.phase = 'reveal';
  state.work = {};
  state.guesses = {};
  state.done = [];
  state.phaseEndsAt = null;
  state.reveal = { book: 0, page: 0, shownAt: ctx.now };
  ctx.announce('📖 Pencils down! Time to open the books.');
}

/** Moves on once everyone who is still here has finished. */
function advanceIfReady(state: ChainState, ctx: GameContext): boolean {
  if (state.phase !== 'prompt' && state.phase !== 'draw' && state.phase !== 'guess') return false;
  const timeUp = state.phaseEndsAt !== null && ctx.now >= state.phaseEndsAt;
  const ready = (id: PlayerId) => (state.phase === 'prompt' ? !!state.prompts[id] : state.done.includes(id));
  // If nobody is here at all, let the clock decide rather than racing through empty rounds.
  const anyoneHere = state.players.some((id) => !isAway(state, id, ctx));
  const allReady = anyoneHere && state.players.every((id) => ready(id) || isAway(state, id, ctx));
  if (!timeUp && !allReady) return false;
  if (state.phase === 'prompt') closePrompts(state, ctx);
  else closeStep(state, ctx);
  return true;
}

function flip(state: ChainState, ctx: GameContext) {
  const book = state.books[state.reveal.book];
  if (state.reveal.page < book.entries.length - 1) {
    state.reveal.page++;
  } else if (state.reveal.book < state.books.length - 1) {
    state.reveal.book++;
    state.reveal.page = 0;
  } else {
    state.phase = 'over';
    ctx.announce('✏️ That’s every book. What a mess.');
  }
  state.reveal.shownAt = ctx.now;
}

const drawingKey = (book: number, page: number) => `b${book}p${page}`;

/** A book's pages as the board shows them: words as they are, drawings by key. */
function pagesOf(book: Book, index: number): RevealPage[] {
  return book.entries.map((e, i) =>
    e.kind === 'draw'
      ? { kind: 'draw', by: e.by, key: drawingKey(index, i), missed: e.missed }
      : { kind: e.kind, by: e.by, text: e.text, missed: e.missed },
  );
}

export const scribbleChain: GameDefinition<ChainState, ChainAction, ChainView> = {
  id: 'scribble-chain',

  setup(players: PlayerInfo[], config, ctx) {
    const ids = shuffle(players.filter((p) => !p.spectator).map((p) => p.id), ctx.random);
    const custom = config.prompts === 'custom';
    // Kept in the room's memory, so a group playing several games in a row doesn't get the same words again.
    const usedWords = ctx.memory ? ((ctx.memory.usedWords ??= []) as string[]) : [];
    const dealt: string[] = [];
    const choices: Record<PlayerId, string[]> = {};
    for (const id of ids) {
      choices[id] = [EASY_WORDS, MEDIUM_WORDS, HARD_WORDS].map((tier) => {
        let fresh = tier.filter((w) => !usedWords.includes(w) && !dealt.includes(w));
        if (!fresh.length) {
          // This room has been through the whole tier: forget it (in place, the list is shared with the room).
          for (let i = usedWords.length - 1; i >= 0; i--) if (tier.includes(usedWords[i])) usedWords.splice(i, 1);
          fresh = tier.filter((w) => !dealt.includes(w));
        }
        const word = pick(fresh.length ? fresh : tier, ctx.random);
        dealt.push(word);
        return word;
      });
    }
    const phaseMs = custom ? PROMPT_CUSTOM_MS : PROMPT_MS;
    return {
      phase: 'prompt',
      step: 0,
      steps: stepsFor(ids.length),
      players: ids,
      books: [],
      custom,
      choices,
      prompts: {},
      work: {},
      guesses: {},
      done: [],
      drawMs: Number(config.drawSeconds ?? 60) * 1000,
      guessMs: Number(config.guessSeconds ?? 30) * 1000,
      phaseEndsAt: ctx.now + phaseMs,
      phaseMs,
      awaySince: {},
      reveal: { book: 0, page: 0, shownAt: ctx.now },
      usedWords,
    };
  },

  action(state, playerId, action, ctx) {
    const seated = state.players.includes(playerId);
    switch (action.type) {
      case 'choose': {
        if (state.phase !== 'prompt') return 'The words have already been picked.';
        if (!seated) return 'Spectators can’t play this round.';
        const word = state.choices[playerId]?.[action.index];
        if (!Number.isInteger(action.index) || !word) return 'Pick one of the words.';
        state.prompts[playerId] = word;
        break;
      }
      case 'write': {
        if (state.phase !== 'prompt') return 'The words have already been picked.';
        if (!seated) return 'Spectators can’t play this round.';
        if (!state.custom) return 'This game uses the deck.';
        const text = clean(action.text);
        if (!text) return 'Write something to draw.';
        state.prompts[playerId] = text;
        break;
      }
      case 'guess': {
        if (state.phase !== 'guess') return 'There is nothing to guess right now.';
        if (!seated) return 'Spectators can’t play this round.';
        const text = clean(action.text);
        if (action.draft) {
          if (state.done.includes(playerId)) return;
          state.guesses[playerId] = text;
          return;
        }
        if (!text) return 'Type a guess first.';
        state.guesses[playerId] = text;
        if (!state.done.includes(playerId)) state.done.push(playerId);
        break;
      }
      case 'done': {
        if (state.phase !== 'draw') return 'There is nothing to hand in right now.';
        if (!seated) return 'Spectators can’t play this round.';
        if (!compactOps((state.work[playerId]?.ops ?? []).map((o) => o.op)).length) return 'Draw something first!';
        if (!state.done.includes(playerId)) state.done.push(playerId);
        break;
      }
      case 'edit': {
        if (state.phase !== 'draw' && state.phase !== 'guess') return 'Too late to change that.';
        state.done = state.done.filter((id) => id !== playerId);
        return;
      }
      case 'next': {
        if (state.phase !== 'reveal') return 'The books aren’t open yet.';
        const owner = state.books[state.reveal.book].owner;
        // Anyone at the table can step in for an owner who has wandered off.
        const standIn = seated && isAway(state, owner, ctx);
        if (playerId !== owner && !ctx.isHost?.(playerId) && !standIn) return 'Only the book’s owner or the host can flip the page.';
        flip(state, ctx);
        return;
      }
      default:
        return 'Unknown action.';
    }
    advanceIfReady(state, ctx);
  },

  tick(state, ctx) {
    if (state.phase === 'over') return false;
    for (const id of state.players) {
      if (ctx.isConnected(id)) delete state.awaySince[id];
      else state.awaySince[id] ??= ctx.now;
    }
    if (state.phase === 'reveal') {
      const owner = state.books[state.reveal.book].owner;
      if (isAway(state, owner, ctx) && ctx.now - state.reveal.shownAt >= AUTO_FLIP_MS) {
        flip(state, ctx);
        return true;
      }
      return false;
    }
    return advanceIfReady(state, ctx);
  },

  /** Brush strokes are recorded but never relayed: nobody sees your page until it is passed on. */
  stream(state, playerId, data) {
    if (state.phase !== 'draw' || !state.players.includes(playerId) || state.done.includes(playerId)) return null;
    const op = validOp(data);
    if (!op) return null;
    const work = (state.work[playerId] ??= { ops: [], seq: 0, points: 0 });
    const points = op.t === 'pts' ? op.pts.length / 2 : 1;
    // Undo and clear always get through, so a full page can still be fixed.
    const erasing = op.t === 'undo' || op.t === 'clear';
    if (!erasing && (work.ops.length >= MAX_OPS || work.points + points > MAX_POINTS)) return null;
    if (op.t === 'clear') {
      work.ops = [];
      work.points = 0;
    } else {
      work.points += erasing ? 0 : points;
    }
    work.ops.push({ seq: ++work.seq, op });
    return null;
  },

  streamSync(state, playerId): ChainSync {
    const sync: ChainSync = { turnId: state.step, ops: [], drawings: {} };
    if (state.phase === 'draw') {
      sync.ops = state.work[playerId]?.ops ?? [];
    } else if (state.phase === 'guess') {
      const last = bookOf(state, playerId)?.entries.at(-1);
      if (last?.kind === 'draw') sync.drawings[`s${state.step}`] = last.ops;
    } else if (state.phase === 'reveal') {
      const { book, page } = state.reveal;
      state.books[book].entries.slice(0, page + 1).forEach((e, i) => {
        if (e.kind === 'draw') sync.drawings[drawingKey(book, i)] = e.ops;
      });
    } else if (state.phase === 'over') {
      // Everything, for saving books as pictures. Only fetched when someone asks for it.
      state.books.forEach((b, book) =>
        b.entries.forEach((e, i) => {
          if (e.kind === 'draw') sync.drawings[drawingKey(book, i)] = e.ops;
        }),
      );
    }
    return sync;
  },

  view(state, viewerId) {
    const seated = state.players.includes(viewerId);
    const book = seated && (state.phase === 'draw' || state.phase === 'guess') ? bookOf(state, viewerId) : null;
    const before = book?.entries.at(-1);

    let task: ChainView['task'] = null;
    if (book && before) {
      task =
        state.phase === 'draw'
          ? { kind: 'draw', text: lastText(book), from: before.by }
          : { kind: 'guess', key: `s${state.step}`, from: before.by, blank: before.kind === 'draw' && before.ops.length === 0 };
    }

    let reveal: ChainView['reveal'] = null;
    if (state.phase === 'reveal') {
      const { book: index, page } = state.reveal;
      const open = state.books[index];
      reveal = {
        book: index,
        books: state.books.length,
        owner: open.owner,
        totalPages: open.entries.length,
        pages: pagesOf(open, index).slice(0, page + 1),
      };
    }

    return {
      phase: state.phase,
      step: state.step,
      steps: state.steps,
      players: state.players,
      done: state.phase === 'prompt' ? state.players.filter((id) => !!state.prompts[id]) : state.done,
      phaseEndsAt: state.phaseEndsAt,
      phaseMs: state.phaseMs,
      role: seated ? 'player' : 'spectator',
      custom: state.custom,
      choices: seated && state.phase === 'prompt' ? state.choices[viewerId] : null,
      myPrompt: state.phase === 'prompt' ? state.prompts[viewerId] ?? null : null,
      task,
      myGuess: state.phase === 'guess' ? state.guesses[viewerId] ?? null : null,
      reveal,
      books: state.phase === 'over' ? state.books.map((b, i) => ({ owner: b.owner, pages: pagesOf(b, i) })) : null,
    };
  },

  isFinished: (state) => state.phase === 'over',
};
