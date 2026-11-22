import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_NOTE } from '../../../shared/games/open-book/limits';
import { NOTE_OPENERS } from '../../../shared/games/open-book/pages';
import type { OpenBookAction, OpenBookView } from '../../../shared/games/open-book/types';
import { Avatar } from '../../components/Avatar';
import { TimerRing } from '../../components/TimerRing';
import { request } from '../../lib/socket';
import { playSound } from '../../lib/sound';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import './open-book.css';

type Props = BoardProps<OpenBookView, OpenBookAction>;
type Players = Props['playersById'];

const nameOf = (players: Players, id: string | null) => (id && players[id]?.name) || 'Someone';

export function OpenBookBoard({ view, room, playersById, isHost, act, serverNow }: Props) {
  // A soft flick whenever a new page lands.
  const seq = useRef(view.pageSeq);
  useEffect(() => {
    if (seq.current === view.pageSeq) return;
    seq.current = view.pageSeq;
    playSound('pageTurn');
  }, [view.pageSeq]);

  return (
    <div className="ob">
      {view.phase === 'pages' && <Reading view={view} you={room.you} playersById={playersById} act={act} />}
      {view.phase === 'notes' && <Notes view={view} playersById={playersById} act={act} serverNow={serverNow} />}
      {view.phase === 'over' && <Closed view={view} playersById={playersById} isHost={isHost} />}
    </div>
  );
}

function Reading({ view, you, playersById, act }: { view: OpenBookView; you: string; playersById: Players; act: Props['act'] }) {
  const page = view.page!;
  const reader = playersById[view.readerId];
  const readerName = nameOf(playersById, view.readerId);
  const isReader = view.readerId === you;
  const isAnswerer = view.answererId === you;
  const readerAway = reader ? !reader.connected : true;
  const playing = view.role === 'player';
  const holdsPage = playing && (isReader || isAnswerer || readerAway);
  const needsPick = page.kind === 'pick' && !view.answererId;
  const lastChapter = view.chapter + 1 >= view.chapterCount;
  const lastPage = view.pageInChapter >= view.pagesPerChapter;
  const voted = view.votes.includes(you);

  const who =
    page.kind === 'reader'
      ? isReader ? 'This one’s yours' : `${readerName} answers`
      : page.kind === 'all'
        ? 'Everyone answers'
        : view.answererId
          ? isAnswerer ? `${readerName} picked you` : `${nameOf(playersById, view.answererId)} answers`
          : isReader ? 'Pick someone to answer' : `${readerName} is picking someone`;

  return (
    <>
      <div className="ob-head">
        <div className="grow">
          <span className="tiny muted">Chapter {view.chapter + 1} of {view.chapterCount}</span>
          <h2 className="ob-chapter">{view.chapterTitle}</h2>
          <span className="muted small">{view.chapterBlurb}</span>
        </div>
        <div className="ob-dots" title={`Page ${view.pageInChapter} of ${view.pagesPerChapter}`}>
          {Array.from({ length: view.pagesPerChapter }, (_, i) => <i key={i} className={i < view.pageInChapter ? 'on' : ''} />)}
        </div>
      </div>

      <div className="ob-stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={view.pageSeq}
            className="ob-page"
            initial={{ rotateY: -70, opacity: 0, x: 60 }}
            animate={{ rotateY: 0, opacity: 1, x: 0 }}
            exit={{ rotateY: 60, opacity: 0, x: -60 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          >
            <div className="ob-page-top">
              {reader && <Avatar player={reader} size={30} />}
              <span><b>{isReader ? 'You’re' : `${readerName} is`}</b> reading</span>
              <span className="ob-kind">{who}</span>
            </div>
            <p className="ob-question">{page.text.replaceAll('{reader}', readerName)}</p>
            <div className="ob-page-foot">
              <span>Answer out loud</span>
              <span>{view.pageInChapter} / {view.pagesPerChapter}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {needsPick && isReader && (
        <div className="ob-pick">
          {view.order.filter((id) => id !== you).map((id) => {
            const p = playersById[id];
            if (!p) return null;
            return (
              <button key={id} className="btn ob-pick-btn" onClick={() => act({ type: 'pick', playerId: id })}>
                <Avatar player={p} size={28} /> {p.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="ob-actions">
        {holdsPage ? (
          <>
            <button className="btn" onClick={() => act({ type: 'pass', seq: view.pageSeq })} title="Swap this page for another. No explanation needed.">
              ↻ Pass, new page
            </button>
            <button className="btn btn-primary btn-lg" disabled={needsPick && isReader} onClick={() => act({ type: 'next', seq: view.pageSeq })}>
              {lastPage ? (lastChapter ? 'Finish the book ▶' : 'Next chapter ▶') : 'Turn the page ▶'}
            </button>
          </>
        ) : (
          <span className="muted">{playing ? `Listen in. ${readerName} turns the page when you’re all done talking.` : 'You’re watching this game.'}</span>
        )}
      </div>
      {holdsPage && readerAway && !isReader && <span className="faint small ob-center">{readerName} is away, so anyone can keep things moving.</span>}

      <div className="ob-foot">
        <div className="ob-circle">
          {view.order.map((id) => {
            const p = playersById[id];
            if (!p) return null;
            return (
              <div key={id} className={`ob-seat ${id === view.readerId ? 'reader' : ''} ${id === view.answererId ? 'answerer' : ''}`} title={p.name}>
                <Avatar player={p} size={28} />
                <span className="ob-seat-name">{p.name}</span>
              </div>
            );
          })}
        </div>
        {playing && (
          <button className={`btn btn-sm ${voted ? 'btn-good' : 'btn-ghost'}`} onClick={() => act({ type: 'vote', chapter: view.chapter })}>
            {voted ? '✓ ' : ''}{lastChapter ? 'Skip to the closing notes' : 'Skip to the next chapter'} ({view.votes.length}/{view.votesNeeded})
          </button>
        )}
      </div>
    </>
  );
}

function Notes({ view, playersById, act, serverNow }: { view: OpenBookView; playersById: Players; act: Props['act']; serverNow: () => number }) {
  const now = useNow(serverNow, true);
  const total = view.noteSeconds * 1000;
  const remaining = view.notesEndAt ? Math.max(0, view.notesEndAt - now) : total;
  const to = view.writingTo ? playersById[view.writingTo] : undefined;
  const [text, setText] = useState(view.myNote ?? '');
  const [editing, setEditing] = useState(view.myNote === null);
  const box = useRef<HTMLTextAreaElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && (await act({ type: 'note', text }))) setEditing(false);
  };
  const open = (opener: string) => {
    setText(opener);
    box.current?.focus();
  };

  return (
    <motion.div className="panel panel-pad ob-notes" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="row">
        <TimerRing remaining={remaining} total={total} live small />
        <div className="grow">
          <span className="tiny muted">The last page</span>
          <h2>{to ? `Write a note to ${to.name}` : 'Everyone is writing a closing note'}</h2>
        </div>
        {to && <Avatar player={to} size={52} />}
      </div>

      {to && editing && (
        <form onSubmit={submit} className="stack">
          <p className="muted ob-note-help">
            Only {to.name} will ever see this. Everyone’s notes are delivered together when the last one is in.
          </p>
          <div className="row wrap" style={{ '--gap': '6px' } as React.CSSProperties}>
            {NOTE_OPENERS.map((o) => (
              <button type="button" key={o} className="chip ob-opener" onClick={() => open(o)}>{o.trim()}…</button>
            ))}
          </div>
          <textarea ref={box} className="input ob-note-box" autoFocus rows={5} maxLength={MAX_NOTE} placeholder={`Dear ${to.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row spread">
            <span className="faint small">{text.length} / {MAX_NOTE}</span>
            <button className="btn btn-primary" disabled={!text.trim()}>Seal it 💌</button>
          </div>
        </form>
      )}
      {to && !editing && (
        <div className="stack ob-center">
          <div style={{ fontSize: 48 }}>💌</div>
          <span className="muted">Your note to {to.name} is sealed. Waiting for the others…</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit my note</button>
        </div>
      )}
      {!to && <p className="muted">You’re not in the note circle this time, so sit tight. The book closes when they’re done.</p>}

      <div className="ob-circle">
        {view.writers.map((id) => {
          const p = playersById[id];
          if (!p) return null;
          const done = view.submitted.includes(id);
          return (
            <div key={id} className={`ob-seat ${done ? 'done' : ''}`} title={done ? `${p.name} is done` : `${p.name} is writing`}>
              <Avatar player={p} size={28} />
              <span className="ob-seat-name">{p.name}</span>
              <span>{done ? '✓' : '✍️'}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function Closed({ view, playersById, isHost }: { view: OpenBookView; playersById: Players; isHost: boolean }) {
  const from = view.received ? playersById[view.received.from] : undefined;
  useEffect(() => playSound('pageTurn'), []);
  return (
    <motion.div className="ob-closed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="ob-center">
        <div style={{ fontSize: 56 }}>📖</div>
        <h1 className="gradient-text">The book is closed</h1>
      </div>

      {view.received ? (
        <motion.div className="ob-page ob-letter" initial={{ rotateX: -40, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }}>
          <div className="ob-page-top">
            {from && <Avatar player={from} size={30} />}
            <span>A note from <b>{nameOf(playersById, view.received.from)}</b></span>
            <span className="ob-kind">Only you can see this</span>
          </div>
          <p className="ob-letter-text">{view.received.text}</p>
        </motion.div>
      ) : (
        <p className="muted ob-center">
          {view.writingTo ? 'No note reached you this time. Whoever had you ran out of time.' : 'The notes have been delivered to the players.'}
        </p>
      )}

      {view.myNote && view.writingTo && (
        <div className="panel ob-sent">
          <span className="tiny muted">What you wrote to {nameOf(playersById, view.writingTo)}</span>
          <p>{view.myNote}</p>
        </div>
      )}

      <div className="ob-center">
        {isHost ? (
          <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Open it again</button>
        ) : (
          <span className="muted">Waiting for the host to start another game…</span>
        )}
      </div>
    </motion.div>
  );
}
