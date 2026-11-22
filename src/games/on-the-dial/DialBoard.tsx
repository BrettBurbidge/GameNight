import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { BAR_RANGES, MAX_BARS } from '../../../shared/games/on-the-dial/scoring';
import type { DialAction, DialView } from '../../../shared/games/on-the-dial/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { TimerRing } from '../../components/TimerRing';
import { request } from '../../lib/socket';
import { playSound } from '../../lib/sound';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import './dial.css';

type Props = BoardProps<DialView, DialAction>;

const BAR_LABELS = ['Static', 'Faint', 'Crackly', 'Getting there', 'Clear', 'Dead on!'];

export function DialBoard({ view, room, playersById, isHost, act, serverNow }: Props) {
  const live = view.phase !== 'over';
  const now = useNow(serverNow, live);
  const total = view.phaseSeconds * 1000;
  const remaining = view.endsAt ? Math.max(0, view.endsAt - now) : total;
  const broadcaster = playersById[view.broadcasterId];
  const name = broadcaster?.name ?? 'Someone';

  // One sweep of the radio when the signal is revealed, and a fanfare for a near-perfect needle.
  const revealed = useRef(view.phase === 'reveal' ? view.round : -1);
  useEffect(() => {
    if (view.phase !== 'reveal' || revealed.current === view.round) return;
    revealed.current = view.round;
    playSound((view.result?.bars[room.you] ?? 0) >= 4 ? 'win' : 'signal');
  }, [view.phase, view.round, view.result, room.you]);

  if (view.phase === 'over') return <GameOver view={view} playersById={playersById} isHost={isHost} />;

  return (
    <div className="dial">
      <div className="dial-head">
        <TimerRing remaining={remaining} total={total} live={view.phase !== 'reveal'} small />
        <div className="grow">
          <span className="tiny muted">
            Broadcast {view.round + 1} of {view.totalRounds}
            {view.mode === 'coop' && ` · co-op · ${view.teamScore} bars`}
          </span>
          <h2 className="dial-status">{statusLine(view, name)}</h2>
        </div>
        {broadcaster && (
          <div className="dial-dj" title={`${name} is broadcasting`}>
            <Avatar player={broadcaster} size={44} />
            <span className="tiny">On air</span>
          </div>
        )}
      </div>

      <Radio key={view.round} view={view} you={room.you} playersById={playersById} act={act} name={name} />

      {view.phase === 'reveal' && view.result && <Results view={view} playersById={playersById} />}
      <Scores view={view} you={room.you} playersById={playersById} />
    </div>
  );
}

function statusLine(view: DialView, name: string) {
  const mine = view.role === 'broadcaster';
  if (view.phase === 'clue') return mine ? 'You’re on air. Give one clue.' : `${name} is thinking of a clue…`;
  if (view.phase === 'tune') return mine ? 'They’re tuning in…' : view.role === 'tuner' ? 'Find the signal!' : 'The tuners are hunting…';
  return 'Here’s where the signal was';
}

function Clue({ view, name }: { view: DialView; name: string }) {
  return (
    <div className="dial-clue">
      <AnimatePresence mode="wait">
        {view.clue ? (
          <motion.div key="clue" className="dial-clue-text" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            “{view.clue}”
          </motion.div>
        ) : (
          <motion.div key="wait" className="dial-clue-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="dial-wave"><i /><i /><i /><i /><i /></span>
            <span className="muted small">{view.role === 'broadcaster' ? 'Your clue goes here' : `Waiting for ${name}’s clue`}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The radio for one round. It owns the needle, so the band and the lock button always agree on where it is. */
function Radio({ view, you, playersById, act, name }: { view: DialView; you: string; playersById: Props['playersById']; act: Props['act']; name: string }) {
  const [needle, setNeedle] = useState(view.myNeedle ?? 50);
  const latest = useRef(needle);
  const locked = view.locked.includes(you);
  const canTune = view.phase === 'tune' && view.role === 'tuner' && !locked;

  const move = (value: number) => {
    latest.current = Math.round(Math.max(0, Math.min(100, value)));
    setNeedle(latest.current);
  };
  // The server only needs to know where the needle rests, so it can count it if time runs out.
  const rest = () => void act({ type: 'tune', value: latest.current });
  const lock = async () => {
    if (await act({ type: 'tune', value: latest.current, lock: true })) playSound('lockIn');
  };

  return (
    <div className="panel dial-radio">
      <Clue view={view} name={name} />
      <Band view={view} you={you} playersById={playersById} needle={needle} locked={locked} canTune={canTune} move={move} rest={rest} lock={lock} />
      <Controls view={view} act={act} name={name} locked={locked} lock={lock} />
    </div>
  );
}

interface BandProps {
  view: DialView;
  you: string;
  playersById: Props['playersById'];
  needle: number;
  locked: boolean;
  canTune: boolean;
  move: (value: number) => void;
  rest: () => void;
  lock: () => void;
}

/** The tuner band: two opposite ends, the hidden signal (when you may see it) and the needles. */
function Band({ view, you, playersById, needle, locked, canTune, move, rest, lock }: BandProps) {
  const track = useRef<HTMLDivElement>(null);
  const showNeedle = view.role === 'tuner' && view.phase !== 'reveal';

  const fromPointer = (e: PointerEvent) => {
    const box = track.current!.getBoundingClientRect();
    move(((e.clientX - box.left) / box.width) * 100);
  };
  const onDown = (e: PointerEvent) => {
    if (!canTune) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPointer(e);
  };
  const onMove = (e: PointerEvent) => {
    if (canTune && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
  };
  const onUp = (e: PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!canTune) return;
    fromPointer(e);
    rest();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!canTune) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') move(needle - step);
    else if (e.key === 'ArrowRight') move(needle + step);
    else if (e.key === 'Enter') return lock();
    else return;
    e.preventDefault();
    rest();
  };

  const pins = view.result ? Object.entries(view.result.needles).sort((a, b) => a[1] - b[1]) : [];

  return (
    <div className="dial-band-wrap">
      <div className="dial-ends">
        <span className="dial-end left">◀ {view.band.left}</span>
        <span className="dial-end right">{view.band.right} ▶</span>
      </div>
      <div
        ref={track}
        className={`dial-band ${canTune ? 'tunable' : ''} ${pins.length ? 'has-pins' : ''}`}
        role={view.role === 'tuner' ? 'slider' : undefined}
        tabIndex={canTune ? 0 : undefined}
        aria-label={`Dial from ${view.band.left} to ${view.band.right}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.role === 'tuner' ? needle : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div className="dial-scale" />
        {view.target !== null && (
          <motion.div className="dial-signal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
            {[...BAR_RANGES].reverse().map((range, i) => (
              <span key={range} className={`dial-zone z${i + 1}`} style={{ left: `${view.target! - range}%`, width: `${range * 2}%` }} />
            ))}
            <span className="dial-signal-core" style={{ left: `${view.target}%` }} />
          </motion.div>
        )}
        {showNeedle && (
          <div className={`dial-needle ${locked ? 'locked' : ''}`} style={{ left: `${needle}%` }}>
            <span className="dial-needle-knob">{locked ? '🔒' : '⇔'}</span>
          </div>
        )}
        {pins.map(([id, value], i) => {
          const p = playersById[id];
          if (!p) return null;
          return (
            <motion.div
              key={id}
              className={`dial-pin row${i % 2} ${id === you ? 'me' : ''}`}
              style={{ left: `${value}%`, '--c': p.color } as React.CSSProperties}
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
              title={`${p.name}: ${view.result!.bars[id]} bars`}
            >
              <Avatar player={p} size={26} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Controls({ view, act, name, locked, lock }: { view: DialView; act: Props['act']; name: string; locked: boolean; lock: () => void }) {
  const { phase, role } = view;
  const tuners = view.order.length - 1;

  if (phase === 'clue' && role === 'broadcaster') return <ClueEntry view={view} act={act} />;
  if (phase === 'clue') {
    return <p className="muted dial-note">Only {name} can see the signal. One clue is coming, then {role === 'tuner' ? 'you tune in' : 'the tuners tune in'}.</p>;
  }
  if (phase === 'tune' && role === 'tuner' && !locked) {
    return (
      <div className="dial-actions">
        <button className="btn btn-primary btn-lg" onClick={lock}>🔒 Lock it in</button>
        <span className="faint small">Drag the needle, or use ← → and Enter. Nobody else can see it.</span>
      </div>
    );
  }
  if (phase === 'tune') {
    return (
      <p className="muted dial-note">
        {locked && 'Locked in. '}
        {view.locked.length} of {tuners} locked in.
        {role === 'broadcaster' && ' No hints — you’re off the chat until the reveal.'}
      </p>
    );
  }
  if (phase === 'reveal' && role !== 'spectator') {
    return (
      <div className="dial-actions">
        <button className="btn btn-primary" onClick={() => act({ type: 'next' })}>
          {view.round + 1 >= view.totalRounds ? 'See final scores ▶' : 'Next broadcast ▶'}
        </button>
      </div>
    );
  }
  return <p className="muted dial-note">You’re watching this game.</p>;
}

function ClueEntry({ view, act }: { view: DialView; act: Props['act'] }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) void act({ type: 'clue', text });
  };
  return (
    <div className="dial-actions">
      <form onSubmit={submit} className="row dial-entry">
        <input className="input" autoFocus maxLength={60} placeholder="Something that sits right at the signal…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={!text.trim()}>Go on air</button>
      </form>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <span className="faint small">The glow marks the signal. One clue, no numbers.</span>
        {view.canSwap && <button className="btn btn-ghost btn-sm" onClick={() => act({ type: 'swap' })}>↻ Swap this band (once)</button>}
      </div>
    </div>
  );
}

function Bars({ n }: { n: number }) {
  return (
    <span className="dial-bars" aria-label={`${n} of ${MAX_BARS} bars`}>
      {Array.from({ length: MAX_BARS }, (_, i) => <i key={i} className={i < n ? 'on' : ''} style={{ height: 6 + i * 3 }} />)}
    </span>
  );
}

function Results({ view, playersById }: { view: DialView; playersById: Props['playersById'] }) {
  const r = view.result!;
  const rows = Object.entries(r.bars).sort((a, b) => b[1] - a[1]);
  const dj = playersById[view.broadcasterId];
  return (
    <motion.div className="panel dial-results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
      {rows.length === 0 && <span className="muted">Nobody tuned in that time.</span>}
      {rows.map(([id, bars]) => {
        const p = playersById[id];
        if (!p) return null;
        return (
          <div key={id} className="dial-result">
            <Avatar player={p} size={28} />
            <span className="grow dial-result-name">{p.name}</span>
            <span className="muted small">{BAR_LABELS[bars]}</span>
            <Bars n={bars} />
            <b className="dial-plus">+{bars}</b>
          </div>
        );
      })}
      {dj && rows.length > 0 && (
        <div className="dial-result dj">
          <Avatar player={dj} size={28} />
          <span className="grow dial-result-name">{dj.name}</span>
          <span className="muted small">{view.mode === 'coop' ? 'Team score for the clue' : 'For the clue (tuners’ average)'}</span>
          <Bars n={r.broadcasterBars} />
          <b className="dial-plus">+{r.broadcasterBars}</b>
        </div>
      )}
    </motion.div>
  );
}

function Scores({ view, you, playersById }: { view: DialView; you: string; playersById: Props['playersById'] }) {
  const ids = view.mode === 'versus' ? [...view.order].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0)) : view.order;
  return (
    <div className="dial-scores">
      {ids.map((id) => {
        const p = playersById[id];
        if (!p) return null;
        const dj = id === view.broadcasterId;
        const locked = view.phase === 'tune' && view.locked.includes(id);
        return (
          <motion.div layout key={id} className={`dial-score ${dj ? 'dj' : ''} ${id === you ? 'me' : ''}`}>
            <Avatar player={p} size={28} />
            <span className="dial-score-name">{p.name}</span>
            {dj && <span title="Broadcasting">🎙️</span>}
            {locked && <span title="Locked in">🔒</span>}
            {view.mode === 'versus' && <b>{view.scores[id] ?? 0}</b>}
          </motion.div>
        );
      })}
    </div>
  );
}

function GameOver({ view, playersById, isHost }: { view: DialView; playersById: Props['playersById']; isHost: boolean }) {
  const coop = view.mode === 'coop';
  const max = view.round * MAX_BARS;
  const share = max ? view.teamScore / max : 0;
  const verdict = share >= 0.85 ? 'Same frequency! 📡' : share >= 0.65 ? 'Loud and clear!' : share >= 0.4 ? 'A bit crackly…' : 'Mostly static 😅';
  const winners = view.winners.map((id) => playersById[id]?.name ?? 'Someone');
  const ranked = [...view.order].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));

  useEffect(() => playSound('win'), []);

  return (
    <div className="dial">
      <motion.div className="panel panel-pad dial-over" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        {(!coop || share >= 0.4) && <Confetti />}
        <div style={{ fontSize: 64 }}>{coop ? '📻' : '🏆'}</div>
        <h1 className="gradient-text">{coop ? verdict : winners.length > 1 ? `${winners.join(' & ')} tie!` : `${winners[0]} wins!`}</h1>
        {coop ? (
          <>
            <div className="dial-final">{view.teamScore}<small> / {max}</small></div>
            <span className="muted">bars picked up together in {view.round} broadcasts</span>
          </>
        ) : (
          <div className="dial-ranking">
            {ranked.map((id, i) => {
              const p = playersById[id];
              if (!p) return null;
              return (
                <div key={id} className={`dial-result ${view.winners.includes(id) ? 'top' : ''}`}>
                  <span className="faint dial-rank">{i + 1}</span>
                  <Avatar player={p} size={28} />
                  <span className="grow dial-result-name">{p.name}</span>
                  <b className="dial-plus">{view.scores[id] ?? 0}</b>
                </div>
              );
            })}
          </div>
        )}
        {isHost ? (
          <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
        ) : (
          <span className="muted">Waiting for the host to start another game…</span>
        )}
      </motion.div>
    </div>
  );
}
