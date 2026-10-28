import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CardId } from '../../../shared/cards';
import type { HeartsAction, HeartsView, PassDirection } from '../../../shared/games/hearts/types';
import type { PlayerInfo } from '../../../shared/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { request } from '../../lib/socket';
import { playSound } from '../../lib/sound';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import { PlayingCard } from './PlayingCard';
import './hearts.css';

type Pos = 'bottom' | 'left' | 'top' | 'right';
const POSITIONS: Pos[] = ['bottom', 'left', 'top', 'right'];
const TRICK_SPOT: Record<Pos, { x: number; y: number; rotate: number }> = {
  bottom: { x: 0, y: 46, rotate: 2 },
  left: { x: -70, y: 0, rotate: -8 },
  top: { x: 0, y: -46, rotate: -3 },
  right: { x: 70, y: 0, rotate: 7 },
};
const FROM: Record<Pos, { x: number; y: number }> = {
  bottom: { x: 0, y: 260 },
  left: { x: -380, y: 0 },
  top: { x: 0, y: -260 },
  right: { x: 380, y: 0 },
};
const PASS_LABEL: Record<PassDirection, string> = { left: 'to the left ←', right: 'to the right →', across: 'across ↑', none: '' };

export function HeartsBoard({ view, room, playersById, isHost, act, serverNow }: BoardProps<HeartsView, HeartsAction>) {
  const mySeat = view.seats.indexOf(room.you);
  const anchor = mySeat >= 0 ? mySeat : 0;
  const posOf = (id: string): Pos => POSITIONS[(view.seats.indexOf(id) - anchor + 4) % 4];
  const seatAt = (pos: Pos) => view.seats[(anchor + POSITIONS.indexOf(pos)) % 4];
  const seated = mySeat >= 0;
  const collecting = useCollecting(view.pendingWinner);
  useHeartsSounds(view);

  return (
    <div className="hearts">
      <div className="hearts-infobar">
        <span className="chip">Hand {view.handNumber + (view.phase === 'hand-over' || view.phase === 'game-over' ? 0 : 1)}</span>
        {view.passDir !== 'none' && view.phase === 'passing' && <span className="chip chip-accent">Passing {PASS_LABEL[view.passDir]}</span>}
        {view.passDir === 'none' && view.phase === 'playing' && view.tricksPlayed === 0 && <span className="chip">No pass this hand</span>}
        <span className={`chip ${view.heartsBroken ? 'broken' : ''}`}>{view.heartsBroken ? '💔 Hearts broken' : '♥ Hearts not broken'}</span>
        <span className="chip">Game to {view.targetScore}</span>
      </div>

      <div className="hearts-table">
        <div className="felt" />
        {(['top', 'left', 'right'] as Pos[]).map((pos) => (
          <Seat key={pos} pos={pos} id={seatAt(pos)} view={view} player={playersById[seatAt(pos)]} />
        ))}
        {!seated && <Seat pos="bottom" id={seatAt('bottom')} view={view} player={playersById[seatAt('bottom')]} />}

        <div className="trick">
          <AnimatePresence>
            {view.trick.map((p) => {
              const pos = posOf(p.playerId);
              const spot = TRICK_SPOT[pos];
              const winnerPos = collecting ? posOf(collecting) : null;
              return (
                <motion.div
                  key={`${view.handNumber}-${p.card}`}
                  className="trick-card"
                  initial={{ ...FROM[pos], opacity: 0, rotate: spot.rotate * 3, scale: 0.8 }}
                  animate={
                    winnerPos
                      ? { x: FROM[winnerPos].x * 0.9, y: FROM[winnerPos].y * 0.9, opacity: 0, scale: 0.5, rotate: 0, transition: { duration: 0.45, ease: 'easeIn' } }
                      : { ...spot, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } }
                  }
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                >
                  <PlayingCard card={p.card} size="md" />
                </motion.div>
              );
            })}
          </AnimatePresence>
          {view.phase === 'playing' && view.trick.length === 0 && view.turn && (
            <div className="trick-hint">{view.turn === room.you ? (view.tricksPlayed === 0 ? 'Lead the 2♣' : 'Your lead') : `${playersById[view.turn]?.name ?? ''} to lead`}</div>
          )}
        </div>
      </div>

      {seated && (
        <MyArea view={view} me={playersById[room.you]} act={act} />
      )}

      {view.phase === 'hand-over' && <Scoreboard view={view} playersById={playersById} you={room.you} act={act} serverNow={serverNow} seated={seated} />}
      {view.phase === 'game-over' && <GameOver view={view} playersById={playersById} isHost={isHost} />}
    </div>
  );
}

/** Sound cues for the dramatic moments. Skips whatever was already true when the board mounted (e.g. on reconnect). */
function useHeartsSounds(view: HeartsView) {
  const seen = useRef({ hand: view.handNumber, broken: view.heartsBroken, queen: view.trick.some((p) => p.card === 'QS') });
  useEffect(() => {
    const s = seen.current;
    if (s.hand !== view.handNumber) {
      s.hand = view.handNumber;
      s.broken = view.heartsBroken;
      s.queen = false;
    }
    if (view.heartsBroken && !s.broken) playSound('heartsBroken');
    s.broken = view.heartsBroken;
    const queenOut = view.trick.some((p) => p.card === 'QS');
    if (queenOut && !s.queen) playSound('queenOfSpades');
    s.queen = queenOut;
  }, [view.handNumber, view.heartsBroken, view.trick]);
}

/** Lets the last card land before the trick slides to its winner. */
function useCollecting(pendingWinner: string | null) {
  const [collecting, setCollecting] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingWinner) return setCollecting(null);
    const id = setTimeout(() => setCollecting(pendingWinner), 700);
    return () => clearTimeout(id);
  }, [pendingWinner]);
  return collecting;
}

function Seat({ pos, id, view, player }: { pos: Pos; id: string; view: HeartsView; player?: PlayerInfo }) {
  if (!player) return null;
  const count = view.handCounts[id] ?? 0;
  const myTurn = view.turn === id;
  const fanCount = Math.min(count, 13);
  return (
    <div className={`seat seat-${pos} ${myTurn ? 'turn' : ''}`}>
      <div className="seat-fan">
        {Array.from({ length: fanCount }, (_, i) => (
          <PlayingCard key={i} faceDown size="sm" style={{ rotate: (i - (fanCount - 1) / 2) * 5, marginLeft: i === 0 ? 0 : -34 }} />
        ))}
      </div>
      <div className="seat-badge">
        <Avatar player={player} size={44} />
        <div className="stack" style={{ '--gap': '0px' } as React.CSSProperties}>
          <span className="seat-name">{player.name}{player.isBot ? ' 🤖' : ''}</span>
          <span className="seat-score">
            {view.scores[id]} pts{view.handPoints[id] ? <b className="seat-hand"> +{view.handPoints[id]}</b> : null}
          </span>
        </div>
        {view.phase === 'passing' && <span className={`seat-flag ${view.passed[id] ? 'done' : ''}`}>{view.passed[id] ? '✓ passed' : 'choosing…'}</span>}
      </div>
    </div>
  );
}

function MyArea({ view, me, act }: { view: HeartsView; me?: PlayerInfo; act: BoardProps['act'] }) {
  const [selected, setSelected] = useState<CardId[]>([]);
  const passing = view.phase === 'passing' && !view.myPass;
  const myTurn = view.phase === 'playing' && view.turn === me?.id;
  const showReceived = view.tricksPlayed === 0 && view.received.length > 0;

  useEffect(() => setSelected([]), [view.handNumber, view.phase]);

  const clickCard = (card: CardId) => {
    if (passing) {
      setSelected((s) => (s.includes(card) ? s.filter((c) => c !== card) : s.length < 3 ? [...s, card] : s));
    } else if (myTurn && view.legal.includes(card)) {
      act({ type: 'play', card });
    }
  };

  const areaRef = useRef<HTMLDivElement>(null);
  const width = useWidth(areaRef);
  const cardW = width < 600 ? 64 : 92;
  const n = view.hand.length;
  const spread = Math.min(width < 600 ? 34 : 50, (width - cardW) / Math.max(n - 1, 1));
  return (
    <div className={`my-area ${myTurn ? 'turn' : ''}`} ref={areaRef}>
      <div className="my-status">
        {me && <Avatar player={me} size={36} />}
        <span className="seat-name">{me?.name}</span>
        <span className="seat-score">{me ? view.scores[me.id] : 0} pts{me && view.handPoints[me.id] ? <b className="seat-hand"> +{view.handPoints[me.id]}</b> : null}</span>
        <span className="grow" />
        {passing && (
          <button className="btn btn-primary" disabled={selected.length !== 3} onClick={() => act({ type: 'pass', cards: selected })}>
            Pass {selected.length}/3 {PASS_LABEL[view.passDir]}
          </button>
        )}
        {view.phase === 'passing' && view.myPass && <span className="muted small">Waiting for others to pass…</span>}
        {myTurn && <motion.span className="your-turn" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>Your turn</motion.span>}
      </div>
      <div className="my-hand" style={{ width: Math.max(0, (n - 1) * spread + cardW) }}>
        <AnimatePresence>
          {view.hand.map((card, i) => {
            const legal = !myTurn || view.legal.includes(card);
            const isSel = selected.includes(card);
            const lift = isSel ? -28 : 0;
            return (
              <motion.div
                key={card}
                className="hand-slot"
                layout
                initial={{ y: 120, opacity: 0 }}
                animate={{ y: lift, opacity: 1, x: 0 }}
                exit={{ y: -160, opacity: 0, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 26, delay: view.tricksPlayed === 0 && view.phase !== 'playing' ? i * 0.02 : 0 }}
                style={{ left: i * spread, zIndex: i }}
                whileHover={(passing || (myTurn && legal)) ? { y: lift - 18 } : undefined}
                onClick={() => clickCard(card)}
              >
                <PlayingCard
                  card={card}
                  size="lg"
                  selected={isSel}
                  disabled={myTurn && !legal}
                  highlight={showReceived && view.received.includes(card)}
                  style={{ cursor: passing || (myTurn && legal) ? 'pointer' : 'default' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function useWidth(ref: React.RefObject<HTMLElement>) {
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function Scoreboard({ view, playersById, you, act, serverNow, seated }: { view: HeartsView; playersById: Record<string, PlayerInfo>; you: string; act: BoardProps['act']; serverNow: () => number; seated: boolean }) {
  const now = useNow(serverNow, true, 500);
  const left = view.handOverUntil ? Math.max(0, Math.ceil((view.handOverUntil - now) / 1000)) : 0;
  const last = view.history[view.history.length - 1] ?? {};
  const ready = view.ready.includes(you);
  const order = [...view.seats].sort((a, b) => view.scores[a] - view.scores[b]);
  return (
    <div className="modal-backdrop">
      <motion.div className="modal panel panel-pad stack hearts-scores" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}>
        <h2>Hand {view.handNumber} results</h2>
        {view.moonShooter && <div className="moon">🌙 {playersById[view.moonShooter]?.name} shot the moon!</div>}
        <ScoreTable view={view} order={order} last={last} playersById={playersById} />
        {seated && (
          <button className="btn btn-primary" disabled={ready} onClick={() => act({ type: 'next' })}>
            {ready ? `Waiting for others… (${left}s)` : `Next hand (${left}s)`}
          </button>
        )}
      </motion.div>
    </div>
  );
}

function ScoreTable({ view, order, last, playersById }: { view: HeartsView; order: string[]; last: Record<string, number>; playersById: Record<string, PlayerInfo> }) {
  return (
    <table className="score-table">
      <thead>
        <tr><th>Player</th><th>This hand</th><th>Total</th></tr>
      </thead>
      <tbody>
        {order.map((id, i) => {
          const p = playersById[id];
          return (
            <motion.tr key={id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}>
              <td><span className="row" style={{ '--gap': '8px' } as React.CSSProperties}>{p && <Avatar player={p} size={26} />}{p?.name}</span></td>
              <td className={last[id] ? 'pts-bad' : 'pts-good'}>{last[id] ? `+${last[id]}` : '0'}</td>
              <td className="pts-total">{view.scores[id]}</td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GameOver({ view, playersById, isHost }: { view: HeartsView; playersById: Record<string, PlayerInfo>; isHost: boolean }) {
  const order = [...view.seats].sort((a, b) => view.scores[a] - view.scores[b]);
  const names = view.winners.map((id) => playersById[id]?.name ?? 'Someone').join(' & ');
  return (
    <div className="modal-backdrop">
      <Confetti />
      <motion.div className="modal panel panel-pad stack hearts-scores" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div style={{ fontSize: 56, textAlign: 'center' }}>🏆</div>
        <h2 style={{ textAlign: 'center' }}>{names} win{view.winners.length === 1 ? 's' : ''}!</h2>
        <ScoreTable view={view} order={order} last={view.history[view.history.length - 1] ?? {}} playersById={playersById} />
        {isHost ? (
          <button className="btn btn-primary" onClick={() => request('room:reset')}>Back to lobby</button>
        ) : (
          <span className="muted small" style={{ textAlign: 'center' }}>Waiting for the host…</span>
        )}
      </motion.div>
    </div>
  );
}
