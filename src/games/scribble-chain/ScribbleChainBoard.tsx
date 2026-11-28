import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { DrawOp } from '../../../shared/drawing';
import type { ChainAction, ChainSync, ChainView, RevealPage } from '../../../shared/games/scribble-chain/types';
import type { PlayerInfo } from '../../../shared/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { TimerRing } from '../../components/TimerRing';
import { request, socket } from '../../lib/socket';
import { useToast } from '../../lib/toast';
import { useNow } from '../../lib/useNow';
import { DrawingView } from '../sketch/DrawingView';
import { SketchCanvas, type SketchCanvasHandle, type Tool } from '../sketch/SketchCanvas';
import { COLORS, SIZES, SketchTools } from '../sketch/SketchTools';
import type { BoardProps } from '../types';
import '../sketch/sketch.css';
import { saveBook } from './saveBook';
import './scribble-chain.css';

type Props = BoardProps<ChainView, ChainAction>;
type People = Record<string, PlayerInfo>;

const TIER = ['Easy', 'Medium', 'Hard'];
const nameOf = (people: People, id: string) => people[id]?.name ?? 'Someone';

/**
 * Finished drawings the server lets this player see right now. They travel outside the room snapshot
 * (which is re-sent on every change), so they are fetched once each time `key` changes.
 */
function useDrawings(key: string) {
  const [drawings, setDrawings] = useState<Record<string, DrawOp[]>>({});
  const latest = useRef(drawings);
  latest.current = drawings;

  /** Asks the server for whatever this player may see now, and returns everything held so far. */
  const fetchMore = useCallback(async () => {
    const res = await request<{ data: ChainSync | null }>('game:stream-sync');
    if (!res.ok || !res.data?.drawings) return latest.current;
    // Pictures already here keep their identity, so they don't replay themselves.
    const merged = { ...res.data.drawings, ...latest.current };
    latest.current = merged;
    setDrawings(merged);
    return merged;
  }, []);

  useEffect(() => {
    if (!key) return;
    fetchMore();
    socket.on('connect', fetchMore);
    return () => {
      socket.off('connect', fetchMore);
    };
  }, [key, fetchMore]);
  return { drawings, fetchMore };
}

type SaveBook = (owner: string, pages: RevealPage[]) => Promise<void>;

function SaveButton({ owner, pages, save, small }: { owner: string; pages: RevealPage[]; save: SaveBook; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    await save(owner, pages);
    setBusy(false);
  };
  return (
    <button className={`btn ${small ? 'btn-sm' : ''}`} disabled={busy} onClick={onClick} aria-label="Save this book as a picture">
      {busy ? 'Saving…' : small ? '💾 Save' : '💾 Save this book as a picture'}
    </button>
  );
}

export function ScribbleChainBoard({ view, room, playersById, isHost, act, serverNow }: Props) {
  const timed = view.phaseEndsAt !== null && (view.phase === 'prompt' || view.phase === 'draw' || view.phase === 'guess');
  const now = useNow(serverNow, timed, 250);
  const remaining = view.phaseEndsAt ? Math.max(0, view.phaseEndsAt - now) : 0;
  const working = view.phase === 'prompt' || view.phase === 'draw' || view.phase === 'guess';
  const iAmDone = view.done.includes(room.you);
  const waitingOn = view.players.filter((id) => !view.done.includes(id) && playersById[id]?.connected);

  const drawingsKey =
    view.phase === 'guess' ? `g${view.step}` : view.reveal ? `r${view.reveal.book}:${view.reveal.pages.length}` : '';
  const { drawings, fetchMore } = useDrawings(drawingsKey);
  const toast = useToast();

  const save: SaveBook = async (owner, pages) => {
    try {
      const missing = pages.some((p) => p.kind === 'draw' && !drawings[p.key]);
      await saveBook(nameOf(playersById, owner), pages, missing ? await fetchMore() : drawings, playersById);
    } catch {
      toast('Couldn’t save that book. Try again?');
    }
  };

  const label =
    view.phase === 'prompt' ? 'Getting started'
    : view.phase === 'reveal' ? `Book ${view.reveal!.book + 1} of ${view.reveal!.books}`
    : view.phase === 'over' ? 'The end'
    : `Pass ${view.step} of ${view.steps}`;
  const headline =
    view.phase === 'prompt' ? 'Start your book'
    : view.phase === 'draw' ? 'Draw!'
    : view.phase === 'guess' ? 'Guess!'
    : view.phase === 'reveal' ? `${nameOf(playersById, view.reveal!.owner)}’s book`
    : 'Scribble Chain';

  return (
    <div className="sc">
      <div className="sc-top panel">
        <span className="tiny muted">{label}</span>
        <span className="sc-headline">{headline}</span>
        <div className="sc-timer">{timed && <TimerRing small remaining={remaining} total={view.phaseMs} live />}</div>
      </div>

      {working && (
        <div className="sk-strip">
          {view.players.map((id) => {
            const p = playersById[id];
            if (!p) return null;
            const done = view.done.includes(id);
            return (
              <div key={id} className={`sk-player ${done ? 'guessed' : ''} ${id === room.you ? 'me' : ''}`}>
                <Avatar player={p} size={28} />
                <span className="sk-player-name">{p.name}</span>
                <span className="sk-badge">{done ? '✓' : view.phase === 'draw' ? '✏️' : '…'}</span>
              </div>
            );
          })}
        </div>
      )}

      {working && view.role === 'spectator' && (
        <div className="panel sc-card">
          <div style={{ fontSize: 44 }}>📒</div>
          <h2>The books are going round</h2>
          <p className="muted">Nobody gets to peek while they’re being passed. You’ll see every page when the books are opened.</p>
        </div>
      )}

      {view.phase === 'prompt' && view.role === 'player' && <PromptPhase view={view} act={act} waiting={waitingOn.length} />}
      {view.phase === 'draw' && view.task?.kind === 'draw' && (
        <DrawPhase key={view.step} view={view} task={view.task} act={act} you={room.you} people={playersById} done={iAmDone} waiting={waitingOn.length} />
      )}
      {view.phase === 'guess' && view.task?.kind === 'guess' && (
        <GuessPhase key={view.step} view={view} task={view.task} act={act} people={playersById} done={iAmDone} waiting={waitingOn.length} ops={drawings[view.task.key]} />
      )}
      {view.phase === 'reveal' && view.reveal && (
        <Reveal key={view.reveal.book} reveal={view.reveal} act={act} you={room.you} isHost={isHost} isPlayer={view.role === 'player'} people={playersById} drawings={drawings} save={save} />
      )}
      {view.phase === 'over' && view.books && <TheEnd books={view.books} people={playersById} isHost={isHost} save={save} />}
    </div>
  );
}

function Waiting({ count }: { count: number }) {
  return <span className="muted small">{count > 0 ? `Waiting on ${count} more…` : 'Passing the books…'}</span>;
}

function PromptPhase({ view, act, waiting }: { view: ChainView; act: Props['act']; waiting: number }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) act({ type: 'write', text });
  };

  return (
    <div className="panel sc-card">
      <h2>{view.custom ? 'Write something for the next player to draw' : 'Pick a word to start your book'}</h2>
      {view.custom ? (
        <form className="sc-form" onSubmit={submit}>
          <input className="input" value={text} maxLength={60} placeholder="A thing, a person, a whole situation…" onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" disabled={!text.trim()}>{view.myPrompt ? 'Change it' : 'Lock it in'}</button>
        </form>
      ) : (
        <div className="sk-choices">
          {view.choices?.map((word, i) => (
            <motion.button
              key={word}
              className={`sk-choice ${view.myPrompt === word ? 'sc-picked' : ''}`}
              onClick={() => act({ type: 'choose', index: i })}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.08 }}
            >
              <span className="tiny">{TIER[i]}</span>
              <b>{word}</b>
            </motion.button>
          ))}
        </div>
      )}
      {view.myPrompt ? (
        <>
          <span>Your book starts with <b className="sc-word">{view.myPrompt}</b></span>
          <Waiting count={waiting} />
        </>
      ) : (
        <span className="muted small">{view.custom ? 'Keep it drawable.' : 'If the clock runs out, one is picked for you.'}</span>
      )}
    </div>
  );
}

function DrawPhase({ view, task, act, you, people, done, waiting }: {
  view: ChainView;
  task: Extract<ChainView['task'], { kind: 'draw' }>;
  act: Props['act'];
  you: string;
  people: People;
  done: boolean;
  waiting: number;
}) {
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const canvas = useRef<SketchCanvasHandle>(null);
  const source = task.from === you ? 'Your word' : view.step === 1 ? `${nameOf(people, task.from)}’s word` : `${nameOf(people, task.from)} thinks it’s`;

  return (
    <div className="sc-stage">
      <div className="panel sc-task">
        <span className="tiny muted">{source}</span>
        <span className="sc-word sc-word-lg">{task.text}</span>
      </div>
      <div className={`sk-canvas-wrap ${done ? 'sc-locked' : ''}`}>
        <SketchCanvas ref={canvas} turnId={view.step} canDraw={!done} tool={tool} color={color} size={size} />
      </div>
      {done ? (
        <div className="panel sc-bar">
          <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
            <b>Handed in ✓</b>
            <Waiting count={waiting} />
          </div>
          <button className="btn" onClick={() => act({ type: 'edit' })}>Keep drawing</button>
        </div>
      ) : (
        <>
          <SketchTools tool={tool} color={color} size={size} onTool={setTool} onColor={setColor} onSize={setSize} canvas={canvas} />
          <button className="btn btn-primary btn-lg" onClick={() => act({ type: 'done' })}>Done — pass it on</button>
        </>
      )}
    </div>
  );
}

function GuessPhase({ view, task, act, people, done, waiting, ops }: {
  view: ChainView;
  task: Extract<ChainView['task'], { kind: 'guess' }>;
  act: Props['act'];
  people: People;
  done: boolean;
  waiting: number;
  ops: DrawOp[] | undefined;
}) {
  const [text, setText] = useState(view.myGuess ?? '');
  const artist = nameOf(people, task.from);

  // Save what's typed so far, so a guess caught mid-word by the clock still goes in the book.
  useEffect(() => {
    if (done || text === (view.myGuess ?? '')) return;
    const id = setTimeout(() => request('game:action', { action: { type: 'guess', text, draft: true } satisfies ChainAction }), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, done]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) act({ type: 'guess', text });
  };

  return (
    <div className="sc-stage">
      <div className="panel sc-task">
        <span className="tiny muted">Drawn by {artist}</span>
        <span className="sc-word">What is this?</span>
      </div>
      <div className="sk-canvas-wrap">
        <DrawingView ops={ops} />
        {task.blank && <div className="sc-blank">{artist} ran out of time.<br />Take a wild guess!</div>}
      </div>
      {done ? (
        <div className="panel sc-bar">
          <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
            <span>You guessed <b className="sc-word">{view.myGuess}</b></span>
            <Waiting count={waiting} />
          </div>
          <button className="btn" onClick={() => act({ type: 'edit' })}>Change</button>
        </div>
      ) : (
        <form className="sc-form" onSubmit={submit}>
          <input className="input" value={text} maxLength={60} placeholder="Type your guess…" enterKeyHint="send" autoComplete="off" onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" disabled={!text.trim()}>Guess</button>
        </form>
      )}
    </div>
  );
}

function Reveal({ reveal, act, you, isHost, isPlayer, people, drawings, save }: {
  reveal: NonNullable<ChainView['reveal']>;
  act: Props['act'];
  you: string;
  isHost: boolean;
  isPlayer: boolean;
  people: People;
  drawings: Record<string, DrawOp[]>;
  save: SaveBook;
}) {
  const owner = people[reveal.owner];
  const shown = reveal.pages.length;
  const finished = shown === reveal.totalPages;
  const lastBook = reveal.book === reveal.books - 1;
  const canFlip = reveal.owner === you || isHost || (isPlayer && !owner?.connected);
  const newest = useRef<HTMLDivElement>(null);
  // Remember how many pages were up when this book opened, so only newly flipped drawings replay.
  const [openedAt] = useState(shown);

  useEffect(() => {
    if (shown > 1) newest.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [shown]);

  const first = reveal.pages[0];
  const last = reveal.pages[shown - 1];

  return (
    <div className="sc-book">
      <div className="sc-pages">
        {reveal.pages.map((page, i) => (
          <motion.div
            key={i}
            ref={i === shown - 1 ? newest : undefined}
            className={`panel sc-page ${i === shown - 1 ? 'newest' : ''}`}
            initial={i >= openedAt || i === 0 ? { opacity: 0, y: 30, rotate: -1.5 } : false}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <PageHead page={page} index={i} people={people} />
            {page.kind === 'draw' ? (
              <div className="sk-canvas-wrap">
                <DrawingView ops={drawings[page.key]} animate={i >= openedAt} />
                {page.missed && <div className="sc-blank">Ran out of time!</div>}
              </div>
            ) : (
              <span className="sc-word sc-word-lg">{page.text}</span>
            )}
            {page.kind === 'guess' && page.missed && <span className="faint small">No guess in time, so the last words were passed along.</span>}
          </motion.div>
        ))}
        <AnimatePresence>
          {finished && first.kind !== 'draw' && last.kind !== 'draw' && (
            <motion.div className="sc-result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
              <span className="tiny">Started as</span>
              <b>{first.text}</b>
              <span className="tiny">Ended as</span>
              <b>{last.text}</b>
            </motion.div>
          )}
        </AnimatePresence>
        {finished && <SaveButton owner={reveal.owner} pages={reveal.pages} save={save} />}
      </div>

      <div className="panel sc-bar sc-flip">
        <span className="muted small">Page {shown} of {reveal.totalPages}</span>
        {canFlip ? (
          <button className="btn btn-primary btn-lg" onClick={() => act({ type: 'next' })}>
            {!finished ? 'Next page' : lastBook ? 'Close the books' : 'Next book →'}
          </button>
        ) : (
          <span className="sc-flipping">
            {owner && <Avatar player={owner} size={24} />}
            {nameOf(people, reveal.owner)} is flipping the pages…
          </span>
        )}
      </div>
    </div>
  );
}

function PageHead({ page, index, people }: { page: RevealPage; index: number; people: People }) {
  const p = people[page.by];
  const verb = index === 0 ? 'started with' : page.kind === 'draw' ? 'drew' : 'guessed';
  return (
    <div className="sc-page-head">
      {p && <Avatar player={p} size={24} />}
      <span><b>{nameOf(people, page.by)}</b> {verb}</span>
    </div>
  );
}

function TheEnd({ books, people, isHost, save }: { books: NonNullable<ChainView['books']>; people: People; isHost: boolean; save: SaveBook }) {
  const words = (page: RevealPage | undefined) => (page && page.kind !== 'draw' ? page.text : '');
  return (
    <div className="panel sc-card">
      <Confetti />
      <div style={{ fontSize: 44 }}>📒</div>
      <h1>That’s every book</h1>
      <div className="sc-summary">
        {books.map((book, i) => {
          const first = words(book.pages[0]);
          const last = words(book.pages.at(-1));
          return (
            <motion.div key={book.owner} className="sc-summary-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * i }}>
              {people[book.owner] && <Avatar player={people[book.owner]} size={28} />}
              <span className="sc-summary-text">
                <b>{first}</b>
                <span className="faint"> → </span>
                <b className={first.toLowerCase() === last.toLowerCase() ? 'sc-same' : 'sc-word'}>{last}</b>
              </span>
              <SaveButton small owner={book.owner} pages={book.pages} save={save} />
            </motion.div>
          );
        })}
      </div>
      {isHost ? (
        <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
      ) : (
        <span className="muted">Waiting for the host to start another game…</span>
      )}
    </div>
  );
}
