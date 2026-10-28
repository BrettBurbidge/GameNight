import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getGameMeta } from '../../../shared/catalog';
import type { SketchAction, SketchView } from '../../../shared/games/sketch/types';
import type { PlayerInfo } from '../../../shared/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { TimerRing } from '../../components/TimerRing';
import { request } from '../../lib/socket';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import { SketchCanvas, type SketchCanvasHandle, type Tool } from './SketchCanvas';
import './sketch.css';

const TEAMS = getGameMeta('sketch')!.teams!;
const COLORS = ['#111827', '#6b7280', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#fde68a'];
const SIZES = [4, 10, 22];
const TIER = ['Easy', 'Medium', 'Hard'];

export function SketchBoard({ view, room, playersById, isHost, act, serverNow }: BoardProps<SketchView, SketchAction>) {
  const timed = view.phase !== 'over' && view.phaseEndsAt !== null;
  const now = useNow(serverNow, timed, 250);
  const remaining = view.phaseEndsAt ? Math.max(0, view.phaseEndsAt - now) : 0;
  const drawer = playersById[view.drawerId];
  const isDrawer = view.role === 'drawer';
  const canDraw = isDrawer && view.phase === 'drawing';
  const activeColor = view.mode === 'teams' ? TEAMS.colors[view.activeTeam] : undefined;

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const canvas = useRef<SketchCanvasHandle>(null);

  return (
    <div className="sk" style={activeColor ? ({ '--active': activeColor } as React.CSSProperties) : undefined}>
      <div className="sk-top panel">
        <div className="sk-round">
          <span className="tiny muted">Round {Math.min(view.round, view.totalRounds)} of {view.totalRounds}</span>
          <span className="sk-drawer">
            {drawer && <Avatar player={drawer} size={22} />}
            {isDrawer ? 'You’re drawing' : `${drawer?.name ?? 'Someone'} is drawing`}
            {view.mode === 'teams' && <span className="chip sk-team-chip" style={{ '--team': TEAMS.colors[view.activeTeam] } as React.CSSProperties}>{TEAMS.names[view.activeTeam]}</span>}
          </span>
        </div>
        <WordDisplay view={view} drawerName={drawer?.name ?? 'Someone'} />
        <div className="sk-timer">{timed && <TimerRing small remaining={remaining} total={view.phaseMs} live={view.phase === 'drawing' || view.phase === 'steal'} />}</div>
      </div>

      <PlayerStrip view={view} playersById={playersById} you={room.you} />

      <div className="sk-main">
        <div className="sk-stage">
          <div className="sk-canvas-wrap">
            <SketchCanvas ref={canvas} turnId={view.turnId} canDraw={canDraw} tool={tool} color={color} size={size} />
            <AnimatePresence>
              {view.phase === 'steal' && (
                <motion.div key="steal" className="sk-steal" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
                  ⏱ Time! {TEAMS.names[view.activeTeam === 0 ? 1 : 0]} can steal{view.role === 'stealer' ? ' — type your guess!' : '…'}
                </motion.div>
              )}
            </AnimatePresence>
            <Overlay view={view} playersById={playersById} isHost={isHost} act={act} drawerName={drawer?.name ?? 'Someone'} drawer={drawer} />
          </div>
          {canDraw && (
            <div className="sk-tools panel">
              <div className="sk-colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`sk-swatch ${color === c && tool !== 'eraser' ? 'on' : ''}`}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                    onClick={() => {
                      setColor(c);
                      if (tool === 'eraser') setTool('brush');
                    }}
                  />
                ))}
              </div>
              <div className="sk-toolrow">
                {SIZES.map((s) => (
                  <button key={s} className={`sk-size ${size === s ? 'on' : ''}`} onClick={() => setSize(s)} aria-label={`Brush size ${s}`}>
                    <i style={{ width: s, height: s }} />
                  </button>
                ))}
                <span className="sk-sep" />
                <button className={`btn btn-sm ${tool === 'brush' ? 'btn-primary' : ''}`} onClick={() => setTool('brush')}>✏️ Brush</button>
                <button className={`btn btn-sm ${tool === 'fill' ? 'btn-primary' : ''}`} onClick={() => setTool('fill')}>🪣 Fill</button>
                <button className={`btn btn-sm ${tool === 'eraser' ? 'btn-primary' : ''}`} onClick={() => setTool('eraser')}>🧽 Eraser</button>
                <span className="sk-sep" />
                <button className="btn btn-sm" onClick={() => canvas.current?.undo()} title="Undo (Ctrl/⌘+Z)">↶ Undo</button>
                <button className="btn btn-sm btn-danger" onClick={() => canvas.current?.clear()}>🗑 Clear</button>
              </div>
            </div>
          )}
        </div>
        <GuessFeed view={view} playersById={playersById} act={act} />
      </div>
    </div>
  );
}

function WordDisplay({ view, drawerName }: { view: SketchView; drawerName: string }) {
  if (view.phase === 'choosing') {
    return <div className="sk-word"><span className="muted">{view.role === 'drawer' ? 'Pick a word to draw' : `${drawerName} is choosing a word…`}</span></div>;
  }
  if (view.phase === 'over') return <div className="sk-word"><span className="sk-word-text">Game over</span></div>;
  if (view.word) {
    return (
      <div className="sk-word">
        <span className="tiny muted">{view.phase === 'reveal' ? 'The word was' : view.role === 'drawer' ? (view.phase === 'drawing' ? 'Draw this' : 'Your word') : 'You got it'}</span>
        <span className="sk-word-text">{view.word}</span>
      </div>
    );
  }
  if (view.mask) {
    const letters = view.mask.filter((c) => c === null || /[a-z0-9]/i.test(c)).length;
    return (
      <div className="sk-word">
        <span className="tiny muted">Guess the word · {letters} letters</span>
        <span className="sk-mask">
          {view.mask.map((c, i) =>
            c === ' ' ? <span key={i} className="sk-gap" /> : <span key={i} className={`sk-blank ${c ? 'shown' : ''}`}>{c ?? ''}</span>,
          )}
        </span>
      </div>
    );
  }
  return <div className="sk-word" />;
}

function PlayerStrip({ view, playersById, you }: { view: SketchView; playersById: Record<string, PlayerInfo>; you: string }) {
  const chip = (id: string) => {
    const p = playersById[id];
    if (!p) return null;
    const guessed = view.guessed.includes(id);
    return (
      <motion.div layout key={id} className={`sk-player ${id === view.drawerId ? 'drawing' : ''} ${guessed ? 'guessed' : ''} ${id === you ? 'me' : ''}`}>
        <Avatar player={p} size={28} />
        <div className="sk-player-info">
          <span className="sk-player-name">{p.name}</span>
          <span className="sk-player-score">{view.scores[id] ?? 0}</span>
        </div>
        {id === view.drawerId && <span className="sk-badge">✏️</span>}
        {guessed && <span className="sk-badge">✓</span>}
      </motion.div>
    );
  };

  if (view.mode === 'teams' && view.teams) {
    return (
      <div className="sk-strip teams">
        {view.teams.map((members, t) => (
          <div key={t} className={`sk-team ${view.activeTeam === t ? 'active' : ''}`} style={{ '--team': TEAMS.colors[t] } as React.CSSProperties}>
            <div className="sk-team-head">
              <span>{TEAMS.names[t]}</span>
              <motion.b key={view.teamScores[t]} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{view.teamScores[t]}</motion.b>
            </div>
            <div className="sk-team-members">{members.map(chip)}</div>
          </div>
        ))}
      </div>
    );
  }
  const order = [...view.players].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  return <div className="sk-strip">{order.map(chip)}</div>;
}

function Overlay({ view, playersById, isHost, act, drawerName, drawer }: { view: SketchView; playersById: Record<string, PlayerInfo>; isHost: boolean; act: BoardProps['act']; drawerName: string; drawer?: PlayerInfo }) {
  let content: React.ReactNode = null;

  if (view.phase === 'choosing') {
    content = view.choices ? (
      <div className="stack sk-choose" style={{ '--gap': '14px' } as React.CSSProperties}>
        <h2>Choose a word to draw</h2>
        <div className="sk-choices">
          {view.choices.map((w, i) => (
            <motion.button key={w} className="sk-choice" onClick={() => act({ type: 'choose', index: i })} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -4 }}>
              <span className="tiny">{TIER[i]}</span>
              <b>{w}</b>
            </motion.button>
          ))}
        </div>
      </div>
    ) : (
      <div className="stack sk-waiting" style={{ '--gap': '12px', alignItems: 'center' } as React.CSSProperties}>
        {drawer && <Avatar player={drawer} size={64} />}
        <h2>{drawerName} is choosing a word…</h2>
      </div>
    );
  }

  if (view.phase === 'reveal' && view.lastResult) {
    const r = view.lastResult;
    const scorers = Object.entries(r.points).filter(([, pts]) => pts > 0).sort((a, b) => b[1] - a[1]);
    const headline =
      r.reason === 'skipped' ? `${playersById[r.drawerId]?.name ?? 'The drawer'} left — turn skipped`
      : r.team?.stolenBy != null ? `Stolen by ${TEAMS.names[r.team.stolenBy]}!`
      : r.team && r.team.points > 0 ? `${TEAMS.names[r.team.drawing]} got it!`
      : r.reason === 'all-guessed' ? 'Everyone got it!'
      : scorers.length ? 'Time’s up!' : 'Nobody got it!';
    content = (
      <div className="stack sk-reveal" style={{ '--gap': '10px', alignItems: 'center' } as React.CSSProperties}>
        <span className="tiny muted">The word was</span>
        <motion.h1 initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>{r.word}</motion.h1>
        <span className="sk-headline">{headline}</span>
        {r.team ? (
          (r.team.points > 0 || r.team.stolenBy != null) && (
            <span className="sk-points">+{r.team.points} {TEAMS.names[r.team.stolenBy ?? r.team.drawing]}</span>
          )
        ) : (
          <div className="sk-scorers">
            {scorers.map(([id, pts]) => (
              <span key={id} className="chip">{playersById[id]?.avatar} {playersById[id]?.name} <b style={{ color: 'var(--good)' }}>+{pts}</b></span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view.phase === 'over') {
    const teamWin = view.mode === 'teams';
    const podium = [...view.players].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0)).slice(0, 3);
    content = (
      <div className="stack sk-over" style={{ '--gap': '14px', alignItems: 'center' } as React.CSSProperties}>
        <Confetti />
        <div style={{ fontSize: 52 }}>🏆</div>
        <h1>
          {teamWin
            ? view.winningTeam === 'tie' ? 'It’s a tie!' : `${TEAMS.names[view.winningTeam as number]} wins!`
            : `${view.winners.map((id) => playersById[id]?.name ?? 'Someone').join(' & ')} win${view.winners.length === 1 ? 's' : ''}!`}
        </h1>
        {teamWin ? (
          <div className="sk-final">
            <span style={{ color: TEAMS.colors[0] }}>{view.teamScores[0]}</span>
            <span className="faint">—</span>
            <span style={{ color: TEAMS.colors[1] }}>{view.teamScores[1]}</span>
          </div>
        ) : (
          <div className="sk-podium">
            {podium.map((id, i) => playersById[id] && (
              <motion.div key={id} className={`sk-step place-${i + 1}`} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.15 }}>
                <Avatar player={playersById[id]} size={i === 0 ? 56 : 44} />
                <b>{playersById[id].name}</b>
                <span>{view.scores[id]} pts</span>
                <div className="sk-plinth">{['🥇', '🥈', '🥉'][i]}</div>
              </motion.div>
            ))}
          </div>
        )}
        {isHost ? (
          <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
        ) : (
          <span className="muted">Waiting for the host to start another game…</span>
        )}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {content && (
        <motion.div key={`${view.phase}-${view.turnId}`} className="sk-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GuessFeed({ view, playersById, act }: { view: SketchView; playersById: Record<string, PlayerInfo>; act: BoardProps['act'] }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const live = view.phase === 'drawing' || view.phase === 'steal';
  const canType = live && (view.role === 'guesser' || view.role === 'guessed' || view.role === 'stealer');

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.feed.length]);

  useEffect(() => {
    if (canType && (view.role === 'guesser' || view.role === 'stealer')) inputRef.current?.focus();
  }, [canType, view.role, view.turnId]);

  const placeholder =
    view.role === 'drawer' ? 'You’re drawing!'
    : view.role === 'watcher' ? 'Watch closely — you may get to steal!'
    : view.role === 'spectator' ? 'Spectating'
    : !live ? 'Wait for the next drawing…'
    : view.role === 'guessed' ? 'Chat with players who got it…'
    : view.role === 'stealer' ? 'Steal it! Type your guess…'
    : 'Type your guess…';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const guess = text;
    setText('');
    await act({ type: 'guess', text: guess });
  };

  return (
    <div className="sk-feed panel">
      <div className="sk-feed-list scroll" ref={listRef}>
        {view.feed.length === 0 && <span className="faint small">Guesses show up here.</span>}
        {view.feed.map((f) => {
          const p = f.playerId ? playersById[f.playerId] : null;
          return (
            <motion.div key={f.id} className={`sk-msg ${f.kind}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              {p && <b style={{ color: f.kind === 'guess' || f.kind === 'insider' ? p.color : undefined }}>{p.name}</b>} {f.text}
            </motion.div>
          );
        })}
      </div>
      <form className="sk-guess" onSubmit={submit}>
        <input ref={inputRef} className="input" placeholder={placeholder} disabled={!canType} value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
      </form>
    </div>
  );
}
