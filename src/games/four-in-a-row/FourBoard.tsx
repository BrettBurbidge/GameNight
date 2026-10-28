import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { COLS, ROWS, type FourAction, type FourView } from '../../../shared/games/four-in-a-row/types';
import type { PlayerInfo } from '../../../shared/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { request } from '../../lib/socket';
import { playSound } from '../../lib/sound';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import './four.css';

const DISC = ['Red', 'Yellow'];

export function FourBoard({ view, playersById, isHost, act, serverNow }: BoardProps<FourView, FourAction>) {
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const myTurn = view.phase === 'playing' && view.you === view.turn;
  const now = useNow(serverNow, view.nextGameAt !== null, 250);
  const nextIn = view.nextGameAt ? Math.max(0, Math.ceil((view.nextGameAt - now) / 1000)) : 0;
  const names = view.seats.map((id) => playersById[id]?.name ?? 'Player');
  const isFull = (col: number) => view.board[col] !== -1;
  useFourSounds(view);

  const drop = (col: number) => {
    if (myTurn && !isFull(col)) act({ type: 'drop', col });
  };

  // 1–7 drops a disc on your turn.
  useEffect(() => {
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= COLS) drop(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let status: string;
  if (view.phase === 'playing') status = myTurn ? 'Your turn — pick a column' : view.you === -1 ? `${names[view.turn]}’s turn` : `Waiting for ${names[view.turn]}…`;
  else if (view.winner === 'draw') status = 'It’s a draw!';
  else status = view.winner === view.you ? 'You win this game!' : `${names[view.winner as number]} wins this game!`;

  return (
    <div className="f4">
      <div className="f4-header">
        <PlayerCard seat={0} view={view} player={playersById[view.seats[0]]} />
        <div className="f4-center">
          <span className="tiny muted">{view.bestOf === 1 ? 'Single game' : `Game ${view.gameNumber} of ${view.bestOf}`}</span>
          <motion.span key={status} className={`f4-status ${myTurn ? 'mine' : ''}`} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            {status}
          </motion.span>
          {view.phase === 'game-over' && <span className="small muted">Next game in {nextIn}…</span>}
        </div>
        <PlayerCard seat={1} view={view} player={playersById[view.seats[1]]} />
      </div>

      <div className="f4-board-area" onMouseLeave={() => setHoverCol(null)}>
        <div className="f4-ghost-row">
          {myTurn && hoverCol !== null && !isFull(hoverCol) && (
            <motion.div
              className={`f4-disc c${view.you} ghost`}
              style={{ left: `${(hoverCol * 100) / COLS}%` }}
              layout
              transition={{ type: 'spring', stiffness: 600, damping: 40 }}
            />
          )}
        </div>
        <div className={`f4-board ${myTurn ? 'my-turn' : ''}`}>
          <div className="f4-discs">
            <AnimatePresence>
              {view.board.map((cell, i) => (cell === -1 ? null : <Disc key={`${view.gameSeq}-${i}`} index={i} seat={cell} view={view} />))}
            </AnimatePresence>
          </div>
          <svg className="f4-frame" viewBox={`0 0 ${COLS * 100} ${ROWS * 100}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <mask id="f4-holes">
                <rect width="100%" height="100%" fill="white" />
                {Array.from({ length: COLS * ROWS }, (_, i) => (
                  <circle key={i} cx={(i % COLS) * 100 + 50} cy={Math.floor(i / COLS) * 100 + 50} r="40" fill="black" />
                ))}
              </mask>
              <linearGradient id="f4-blue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3b6cf6" />
                <stop offset="1" stopColor="#1d3fb8" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#f4-blue)" mask="url(#f4-holes)" rx="18" />
          </svg>
          <div className="f4-cols">
            {Array.from({ length: COLS }, (_, col) => (
              <button
                key={col}
                className={`f4-col ${hoverCol === col && myTurn ? 'hover' : ''}`}
                aria-label={`Drop in column ${col + 1}`}
                disabled={!myTurn || isFull(col)}
                onMouseEnter={() => setHoverCol(col)}
                onFocus={() => setHoverCol(col)}
                onClick={() => drop(col)}
              />
            ))}
          </div>
        </div>
        <div className="f4-col-labels">
          {Array.from({ length: COLS }, (_, i) => <span key={i}>{i + 1}</span>)}
        </div>
      </div>

      {view.phase === 'match-over' && <MatchOver view={view} names={names} playersById={playersById} isHost={isHost} />}
    </div>
  );
}

function PlayerCard({ seat, view, player }: { seat: 0 | 1; view: FourView; player?: PlayerInfo }) {
  const active = view.phase === 'playing' && view.turn === seat;
  return (
    <motion.div className={`f4-player s${seat} ${active ? 'active' : ''}`} animate={{ scale: active ? 1 : 0.97 }}>
      <div className={`f4-disc-icon c${seat}`} />
      {player && <Avatar player={player} size={36} />}
      <div className="f4-player-info">
        <span className="f4-player-name">
          {player?.name ?? 'Player'}
          {view.you === seat && <span className="faint"> (you)</span>}
          {player?.isBot && ' 🤖'}
        </span>
        <span className="tiny muted">{DISC[seat]}</span>
      </div>
      {view.bestOf > 1 && <motion.span key={view.wins[seat]} className="f4-wins" initial={{ scale: 1.6 }} animate={{ scale: 1 }}>{view.wins[seat]}</motion.span>}
    </motion.div>
  );
}

function Disc({ index, seat, view }: { index: number; seat: 0 | 1; view: FourView }) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  // Only the newest disc falls; everything else (e.g. after a reconnect) just appears.
  const isNew = view.lastMove?.cell === index;
  const [fromAbove] = useState(isNew);
  const inLine = view.winLine?.includes(index) ?? false;
  const dimmed = !!view.winLine && !inLine;
  return (
    <motion.div
      className={`f4-disc c${seat} ${inLine ? 'win' : ''} ${dimmed ? 'dim' : ''}`}
      style={{ left: `${(col * 100) / COLS}%`, top: `${(row * 100) / ROWS}%` }}
      initial={fromAbove ? { y: `${-(row + 1) * 100 - 20}%` } : false}
      animate={{ y: 0 }}
      exit={{ y: `${(ROWS - row + 2) * 100}%`, transition: { duration: 0.45, ease: 'easeIn', delay: col * 0.03 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.9 }}
    />
  );
}

/** Drop and win sounds for new moves only (not when the board first loads). */
function useFourSounds(view: FourView) {
  const seen = useRef({ seq: view.lastMove?.seq ?? 0, result: `${view.gameSeq}-${view.winner}` });
  useEffect(() => {
    const s = seen.current;
    if (view.lastMove && view.lastMove.seq !== s.seq) {
      s.seq = view.lastMove.seq;
      setTimeout(() => playSound('discDrop'), 180);
    }
    const result = `${view.gameSeq}-${view.winner}`;
    if (result !== s.result) {
      s.result = result;
      if (view.winner === 0 || view.winner === 1) setTimeout(() => playSound('win'), 380);
    }
  }, [view.lastMove, view.winner, view.gameSeq]);
}

function MatchOver({ view, names, playersById, isHost }: { view: FourView; names: string[]; playersById: Record<string, PlayerInfo>; isHost: boolean }) {
  const w = view.matchWinner;
  const title = w === 'draw' ? 'The match is a draw!' : w === view.you ? 'You win the match!' : `${names[w as number]} wins${view.bestOf > 1 ? ' the match' : ''}!`;
  const winner = w === 0 || w === 1 ? playersById[view.seats[w]] : undefined;
  return (
    <motion.div className="f4-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
      {w !== 'draw' && <Confetti />}
      <motion.div className="panel panel-pad stack f4-over" initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 20 }}>
        <div style={{ fontSize: 52 }}>{w === 'draw' ? '🤝' : '🏆'}</div>
        {winner && <Avatar player={winner} size={56} />}
        <h1>{title}</h1>
        {view.bestOf > 1 && (
          <div className="f4-final">
            <span className="r">{view.wins[0]}</span>
            <span className="faint">—</span>
            <span className="y">{view.wins[1]}</span>
            {view.draws > 0 && <span className="small muted">({view.draws} draw{view.draws === 1 ? '' : 's'})</span>}
          </div>
        )}
        {isHost ? (
          <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
        ) : (
          <span className="muted">Waiting for the host…</span>
        )}
      </motion.div>
    </motion.div>
  );
}
