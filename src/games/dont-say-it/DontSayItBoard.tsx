import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getGameMeta } from '../../../shared/catalog';
import type { DontSayItAction, DontSayItView } from '../../../shared/games/dont-say-it/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { request } from '../../lib/socket';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import './dont-say-it.css';

const TEAMS = getGameMeta('dont-say-it')!.teams!;
const COOP = { name: 'Team Together', color: '#c084fc' };
const teamName = (view: DontSayItView, t: 0 | 1) => (view.mode === 'coop' ? COOP.name : TEAMS.names[t]);
const teamColor = (view: DontSayItView, t: 0 | 1) => (view.mode === 'coop' ? COOP.color : TEAMS.colors[t]);

export function DontSayItBoard({ view, room, playersById, isHost, act, serverNow }: BoardProps<DontSayItView, DontSayItAction>) {
  const now = useNow(serverNow, view.phase === 'turn');
  const remaining = view.turnEndsAt ? Math.max(0, view.turnEndsAt - now) : view.turnSeconds * 1000;
  const giver = playersById[view.giverId];
  const activeColor = teamColor(view, view.activeTeam);

  return (
    <div className="dsi" style={{ '--active': activeColor } as React.CSSProperties}>
      <div className={`dsi-scoreboard ${view.mode}`}>
        <TeamPanel team={0} view={view} playersById={playersById} />
        <div className="dsi-center">
          <TimerRing remaining={remaining} total={view.turnSeconds * 1000} live={view.phase === 'turn'} />
          <span className="tiny muted">
            {view.phase === 'over' ? 'Final' : `Turn ${Math.min(view.turnsTaken + 1, view.totalTurns)} of ${view.totalTurns}`}
          </span>
        </div>
        {view.mode === 'teams' && <TeamPanel team={1} view={view} playersById={playersById} />}
      </div>

      <div className="dsi-stage">
        {view.phase === 'ready' && <ReadyPanel view={view} giverName={giver?.name ?? 'Someone'} act={act} you={room.you} playersById={playersById} />}
        {view.phase === 'turn' && <TurnPanel view={view} act={act} />}
        {view.phase === 'over' && <GameOver view={view} isHost={isHost} />}
      </div>

      {view.phase === 'turn' && <Feed view={view} playersById={playersById} />}
      <EventFlash view={view} />
    </div>
  );
}

function TeamPanel({ team, view, playersById }: { team: 0 | 1; view: DontSayItView; playersById: BoardProps['playersById'] }) {
  const active = view.activeTeam === team && view.phase !== 'over';
  return (
    <motion.div
      className={`dsi-team ${active ? 'active' : ''} ${team === 1 ? 'right' : ''}`}
      style={{ '--team': teamColor(view, team) } as React.CSSProperties}
      animate={{ scale: active ? 1 : 0.97, opacity: active ? 1 : 0.75 }}
    >
      <div className="dsi-team-head">
        <span className="dsi-team-name">{teamName(view, team)}</span>
        <motion.span key={view.scores[team]} className="dsi-score" initial={{ scale: 1.6 }} animate={{ scale: 1 }}>
          {view.scores[team]}
        </motion.span>
      </div>
      <div className="dsi-members">
        {view.teams[team].map((id) => {
          const p = playersById[id];
          if (!p) return null;
          return (
            <div key={id} className={`dsi-member ${id === view.giverId && active ? 'giver' : ''}`} title={p.name}>
              <Avatar player={p} size={30} />
              <span>{p.name}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function TimerRing({ remaining, total, live }: { remaining: number; total: number; live: boolean }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / total));
  const secs = Math.ceil(remaining / 1000);
  const urgent = live && secs <= 10;
  return (
    <div className={`timer ${urgent ? 'urgent' : ''}`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="timer-track" />
        <circle cx="50" cy="50" r={r} className="timer-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="timer-text">{secs}</span>
    </div>
  );
}

function ReadyPanel({ view, giverName, act, you, playersById }: { view: DontSayItView; giverName: string; act: BoardProps['act']; you: string; playersById: BoardProps['playersById'] }) {
  const myTeam = view.teams[0].includes(you) ? 0 : view.teams[1].includes(you) ? 1 : null;
  const isGiver = view.giverId === you;
  const onActiveTeam = myTeam === view.activeTeam;
  const giver = playersById[view.giverId];

  return (
    <motion.div className="panel panel-pad dsi-ready" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} key={view.turnsTaken}>
      {view.lastTurn && <TurnRecap view={view} playersById={playersById} />}
      <div className="stack dsi-up" style={{ '--gap': '14px' } as React.CSSProperties}>
        <span className="tiny" style={{ color: 'var(--active)' }}>
          {view.mode === 'coop' ? `Turn ${view.turnsTaken + 1} of ${view.totalTurns} · co-op` : `${TEAMS.names[view.activeTeam]} is up`}
        </span>
        {giver && <Avatar player={giver} size={72} />}
        <h2 className="dsi-up-title">{isGiver ? 'You’re giving clues!' : `${giverName} is giving clues`}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {isGiver
            ? 'Describe the word by voice or type clues. Don’t say any of the forbidden words!'
            : onActiveTeam
              ? view.mode === 'coop' ? 'Everyone else guesses — type as fast as you can.' : 'Get ready to type your guesses as fast as you can.'
              : 'You’ll see the card too — hit BUZZ if they say a forbidden word.'}
        </p>
        {isGiver && (
          <button className="btn btn-primary btn-lg pulse-btn" onClick={() => act({ type: 'start-turn' })}>
            Start my turn ▶
          </button>
        )}
        {!isGiver && onActiveTeam && (
          <button className="btn btn-ghost btn-sm" onClick={() => act({ type: 'start-turn', takeOver: true })}>
            {giverName} away? Give clues instead
          </button>
        )}
      </div>
    </motion.div>
  );
}

function TurnRecap({ view, playersById }: { view: DontSayItView; playersById: BoardProps['playersById'] }) {
  const t = view.lastTurn!;
  return (
    <div className="dsi-recap" style={{ '--team': teamColor(view, t.team) } as React.CSSProperties}>
      <div className="row spread">
        <span className="small"><b style={{ color: 'var(--team)' }}>{playersById[t.giverId]?.name ?? 'Last turn'}</b> scored</span>
        <span className={`recap-points ${t.points < 0 ? 'neg' : ''}`}>{t.points > 0 ? '+' : ''}{t.points}</span>
      </div>
      <div className="row wrap" style={{ '--gap': '6px' } as React.CSSProperties}>
        {t.results.length === 0 && <span className="faint small">No cards played.</span>}
        {t.results.map((r, i) => (
          <span key={i} className={`recap-word ${r.result}`}>{r.result === 'correct' ? '✓' : r.result === 'forbidden' ? '✕' : '↷'} {r.word}</span>
        ))}
      </div>
    </div>
  );
}

function TurnPanel({ view, act }: { view: DontSayItView; act: BoardProps['act'] }) {
  const { role } = view;
  return (
    <div className="dsi-turn">
      <div className="card-wrap">
        <AnimatePresence mode="popLayout">
          {view.card ? (
            <motion.div
              key={view.cardSeq}
              className="dsi-card"
              initial={{ rotateY: -90, opacity: 0, scale: 0.9 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              exit={{ x: 200, rotate: 12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <div className="dsi-card-word">{view.card.word}</div>
              <ul className="dsi-card-list">
                {view.card.forbidden.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </motion.div>
          ) : (
            <motion.div
              key={`back-${view.cardSeq}`}
              className="dsi-card back"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <span className="back-q">?</span>
              <span className="muted">Guess the word!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="dsi-controls">
        {role === 'giver' && (
          <>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn btn-good btn-lg" onClick={() => act({ type: 'correct' })}>✓ They got it</button>
              <button className="btn btn-lg" onClick={() => act({ type: 'skip' })}>Skip ↷</button>
            </div>
            <TextEntry placeholder="Type a clue (optional — forbidden words get buzzed!)" onSubmit={(text) => act({ type: 'clue', text })} />
          </>
        )}
        {role === 'guesser' && <TextEntry autoFocus placeholder="Type your guess and hit enter…" big onSubmit={(text) => act({ type: 'guess', text })} />}
        {role === 'watcher' && (
          <motion.button className="buzz" whileTap={{ scale: 0.9 }} onClick={() => act({ type: 'buzz' })}>
            BUZZ!
            <small>They said a forbidden word</small>
          </motion.button>
        )}
        {role === 'spectator' && <p className="muted center">You’re watching this game.</p>}
      </div>
    </div>
  );
}

function TextEntry({ placeholder, onSubmit, autoFocus, big }: { placeholder: string; onSubmit: (text: string) => void; autoFocus?: boolean; big?: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(text);
    setText('');
  };
  return (
    <form onSubmit={submit} className="row dsi-entry">
      <input ref={ref} className={`input ${big ? 'input-big' : ''}`} placeholder={placeholder} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-primary">Send</button>
    </form>
  );
}

function Feed({ view, playersById }: { view: DontSayItView; playersById: BoardProps['playersById'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [view.feed.length]);
  return (
    <div className="panel dsi-feed scroll" ref={ref}>
      {view.feed.length === 0 && <span className="faint small">Clues and guesses show up here.</span>}
      <AnimatePresence initial={false}>
        {view.feed.map((f) => {
          const p = f.playerId ? playersById[f.playerId] : null;
          return (
            <motion.div key={f.id} className={`feed-item ${f.kind}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
              {p && <span className="feed-who" style={{ color: p.color }}>{p.avatar} {p.name}{f.kind === 'clue' ? ' (clue)' : ''}</span>}
              <span>{f.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function EventFlash({ view }: { view: DontSayItView }) {
  const [shown, setShown] = useState<DontSayItView['lastEvent']>(null);
  const lastSeq = useRef(view.lastEvent?.seq ?? 0);
  useEffect(() => {
    const e = view.lastEvent;
    if (!e || e.seq === lastSeq.current) return;
    lastSeq.current = e.seq;
    setShown(e);
  }, [view.lastEvent]);
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(null), 1100);
    return () => clearTimeout(id);
  }, [shown]);

  const label = shown?.kind === 'correct' ? '+1' : shown?.kind === 'forbidden' ? 'SAID IT!' : 'Skip';
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.seq}
          className={`event-flash ${shown.kind}`}
          initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        >
          <span className="event-label">{label}</span>
          <span className="event-word">{shown.word}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GameOver({ view, isHost }: { view: DontSayItView; isHost: boolean }) {
  if (view.mode === 'coop') return <CoopOver view={view} isHost={isHost} />;
  const title = view.winner === 'tie' ? 'It’s a tie!' : `${TEAMS.names[view.winner as number]} wins!`;
  return (
    <motion.div className="panel panel-pad dsi-over" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <Confetti />
      <div style={{ fontSize: 64 }}>🏆</div>
      <h1 style={{ color: view.winner === 'tie' ? undefined : TEAMS.colors[view.winner as number] }}>{title}</h1>
      <div className="dsi-final">
        <span style={{ color: TEAMS.colors[0] }}>{view.scores[0]}</span>
        <span className="faint">—</span>
        <span style={{ color: TEAMS.colors[1] }}>{view.scores[1]}</span>
      </div>
      {isHost ? (
        <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
      ) : (
        <span className="muted">Waiting for the host to start another round…</span>
      )}
    </motion.div>
  );
}

function CoopOver({ view, isHost }: { view: DontSayItView; isHost: boolean }) {
  const score = view.scores[0];
  const perTurn = view.totalTurns ? score / view.totalTurns : 0;
  const verdict = perTurn >= 5 ? 'Mind readers! 🔮' : perTurn >= 3 ? 'Great teamwork!' : perTurn >= 1 ? 'Nice warm-up!' : 'Practice round 😅';
  return (
    <motion.div className="panel panel-pad dsi-over" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      {score > 0 && <Confetti />}
      <div style={{ fontSize: 64 }}>🤝</div>
      <h1 style={{ color: COOP.color }}>{verdict}</h1>
      <div className="dsi-final"><span>{score}</span></div>
      <span className="muted">words together in {view.totalTurns} turns</span>
      {isHost ? (
        <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
      ) : (
        <span className="muted">Waiting for the host to start another round…</span>
      )}
    </motion.div>
  );
}
