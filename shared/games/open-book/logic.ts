import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import { MAX_NOTE, NOTE_SECONDS } from './limits';
import { CHAPTERS } from './pages';
import type { OpenBookAction, OpenBookView } from './types';

interface OpenBookState {
  phase: 'pages' | 'notes' | 'over';
  order: PlayerId[];
  chapter: number;
  pageInChapter: number;
  pagesPerChapter: number;
  /** A shuffled deck per chapter, so passing never repeats a page until the chapter runs dry. */
  decks: number[][];
  pageIndex: number;
  pageSeq: number;
  readerId: PlayerId;
  answererId: PlayerId | null;
  votes: PlayerId[];
  /** A majority of the players who are here; kept fresh by tick() as people come and go. */
  votesNeeded: number;
  notesEndAt: number | null;
  /** writer -> recipient. Everyone writes one note and gets one. */
  pairs: Record<PlayerId, PlayerId>;
  notes: Record<PlayerId, string>;
}


function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealPage(state: OpenBookState, ctx: GameContext) {
  const deck = state.decks[state.chapter];
  if (deck.length === 0) deck.push(...shuffle(CHAPTERS[state.chapter].pages.map((_, i) => i), ctx.random));
  state.pageIndex = deck.pop()!;
  state.pageSeq++;
  state.answererId = null;
}

/** The next person in the circle who is actually here. */
function nextReader(state: OpenBookState, ctx: GameContext): PlayerId {
  const at = state.order.indexOf(state.readerId);
  for (let step = 1; step <= state.order.length; step++) {
    const id = state.order[(at + step) % state.order.length];
    if (ctx.isConnected(id)) return id;
  }
  return state.order[(at + 1) % state.order.length];
}

const votesNeeded = (state: OpenBookState, ctx: GameContext) =>
  Math.floor(state.order.filter((id) => ctx.isConnected(id)).length / 2) + 1;

function startNotes(state: OpenBookState, ctx: GameContext) {
  // Only pair up people who are here, so nobody is left waiting on a note from an empty chair.
  const here = state.order.filter((id) => ctx.isConnected(id));
  const writers = shuffle(here.length >= 2 ? here : state.order, ctx.random);
  state.pairs = Object.fromEntries(writers.map((id, i) => [id, writers[(i + 1) % writers.length]]));
  state.notes = {};
  state.phase = 'notes';
  state.notesEndAt = ctx.now + NOTE_SECONDS * 1000;
  state.votes = [];
}

function closeBook(state: OpenBookState, ctx: GameContext) {
  state.phase = 'over';
  state.notesEndAt = null;
  ctx.announce('The book is closed. Your notes have been delivered. 💌');
}

function startChapter(state: OpenBookState, chapter: number, ctx: GameContext) {
  state.votes = [];
  if (chapter >= CHAPTERS.length) return startNotes(state, ctx);
  state.chapter = chapter;
  state.pageInChapter = 1;
  ctx.announce(`Chapter ${chapter + 1}: ${CHAPTERS[chapter].title}.`);
  dealPage(state, ctx);
}

function everyNoteIn(state: OpenBookState, ctx: GameContext) {
  const here = Object.keys(state.pairs).filter((id) => ctx.isConnected(id));
  return Object.keys(state.notes).length > 0 && here.every((id) => state.notes[id] !== undefined);
}

export const openBook: GameDefinition<OpenBookState, OpenBookAction, OpenBookView> = {
  id: 'open-book',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length < 2 ? 'You need at least 2 players.' : null;
  },

  setup(players: PlayerInfo[], config, ctx) {
    const order = shuffle(players.filter((p) => !p.spectator).map((p) => p.id), ctx.random);
    const state: OpenBookState = {
      phase: 'pages',
      order,
      chapter: 0,
      pageInChapter: 1,
      pagesPerChapter: Number(config.pagesPerChapter ?? 6),
      decks: CHAPTERS.map((c) => shuffle(c.pages.map((_, i) => i), ctx.random)),
      pageIndex: 0,
      pageSeq: 0,
      readerId: order[0],
      answererId: null,
      votes: [],
      votesNeeded: 0,
      notesEndAt: null,
      pairs: {},
      notes: {},
    };
    state.votesNeeded = votesNeeded(state, ctx);
    dealPage(state, ctx);
    return state;
  },

  action(state, playerId, action, ctx) {
    if (!state.order.includes(playerId)) return 'Only players can do that.';
    const isReader = playerId === state.readerId;
    // If the reader has wandered off, anyone can keep the book moving.
    const holdsPage = isReader || playerId === state.answererId || !ctx.isConnected(state.readerId);

    switch (action.type) {
      case 'pick': {
        if (state.phase !== 'pages') return 'There is no page open.';
        if (!isReader) return 'Only the reader picks who answers.';
        if (CHAPTERS[state.chapter].pages[state.pageIndex][0] !== 'pick') return 'This page is not for picking.';
        if (action.playerId === playerId || !state.order.includes(action.playerId)) return 'Pick one of the other players.';
        state.answererId = action.playerId;
        return;
      }
      case 'pass':
        if (state.phase !== 'pages') return 'There is no page open.';
        if (!holdsPage) return 'Only the reader or the person answering can pass.';
        if (action.seq !== state.pageSeq) return;
        dealPage(state, ctx);
        return;
      case 'next':
        if (state.phase !== 'pages') return 'There is no page open.';
        if (!holdsPage) return 'Only the reader or the person answering can turn the page.';
        if (action.seq !== state.pageSeq) return;
        state.readerId = nextReader(state, ctx);
        if (state.pageInChapter >= state.pagesPerChapter) return startChapter(state, state.chapter + 1, ctx);
        state.pageInChapter++;
        dealPage(state, ctx);
        return;
      case 'vote':
        if (state.phase !== 'pages' || action.chapter !== state.chapter) return;
        if (state.votes.includes(playerId)) state.votes = state.votes.filter((id) => id !== playerId);
        else state.votes.push(playerId);
        state.votesNeeded = votesNeeded(state, ctx);
        if (state.votes.length >= state.votesNeeded) {
          state.readerId = nextReader(state, ctx);
          startChapter(state, state.chapter + 1, ctx);
        }
        return;
      case 'note': {
        if (state.phase !== 'notes') return 'It is not time for notes.';
        if (!state.pairs[playerId]) return 'You joined too late to write a note this time.';
        const text = String(action.text ?? '').replace(/\r/g, '').trim().slice(0, MAX_NOTE);
        if (!text) return 'Write something first.';
        state.notes[playerId] = text;
        if (everyNoteIn(state, ctx)) closeBook(state, ctx);
        return;
      }
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.phase === 'pages') {
      const needed = votesNeeded(state, ctx);
      if (needed === state.votesNeeded) return false;
      state.votesNeeded = needed;
      return true;
    }
    if (state.phase !== 'notes' || state.notesEndAt === null) return false;
    if (ctx.now < state.notesEndAt && !everyNoteIn(state, ctx)) return false;
    closeBook(state, ctx);
    return true;
  },

  addPlayer(state, player) {
    // Once the notes are being written the pairs are fixed, so latecomers just watch the ending.
    if (state.phase !== 'pages') return false;
    state.order.push(player.id);
    return { team: null };
  },

  view(state, viewerId) {
    const seated = state.order.includes(viewerId);
    const chapter = CHAPTERS[state.chapter];
    const [kind, text] = chapter.pages[state.pageIndex];
    const writer = Object.keys(state.pairs).find((id) => state.pairs[id] === viewerId);
    return {
      phase: state.phase,
      order: state.order,
      role: seated ? 'player' : 'spectator',
      chapter: state.chapter,
      chapterCount: CHAPTERS.length,
      chapterTitle: chapter.title,
      chapterBlurb: chapter.blurb,
      pageInChapter: state.pageInChapter,
      pagesPerChapter: state.pagesPerChapter,
      pageSeq: state.pageSeq,
      page: state.phase === 'pages' ? { kind, text } : null,
      readerId: state.readerId,
      answererId: state.answererId,
      votes: state.votes,
      votesNeeded: state.votesNeeded,
      noteSeconds: NOTE_SECONDS,
      notesEndAt: state.notesEndAt,
      writers: Object.keys(state.pairs),
      submitted: Object.keys(state.notes),
      writingTo: state.pairs[viewerId] ?? null,
      myNote: state.notes[viewerId] ?? null,
      received:
        state.phase === 'over' && writer && state.notes[writer] !== undefined ? { from: writer, text: state.notes[writer] } : null,
    };
  },

  isFinished: (state) => state.phase === 'over',
};
