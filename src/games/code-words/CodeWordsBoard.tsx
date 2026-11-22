import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getGameMeta } from '../../../shared/catalog';
import { CRACK_POINTS, INTERCEPT_POINTS } from '../../../shared/games/code-words/logic';
import type { CodeWordsAction, CodeWordsView, Slot } from '../../../shared/games/code-words/types';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { TimerRing } from '../../components/TimerRing';
import { request } from '../../lib/socket';
import { playSound } from '../../lib/sound';
import { useNow } from '../../lib/useNow';
import type { BoardProps } from '../types';
import './code-words.css';

type Props = BoardProps<CodeWordsView, CodeWordsAction>;
type Players = Props['playersById'];

const TEAMS = getGameMeta('code-words')!.teams!;
const other = (t: 0 | 1): 0 | 1 => (t === 0 ? 1 : 0);

export function CodeWordsBoard({ view, room, playersById, isHost, act, serverNow }: Props) {
  const now = useNow(serverNow, view.phase !== 'over');
  const total = view.phaseSeconds * 1000;
  const remaining = view.endsAt ? Math.max(0, view.endsAt - now) : total;

  // One sound per reveal: a flourish if your team scored, a plain blip if not.
  const revealed = useRef(-1);
  useEffect(() => {
    if (view.phase !== 'reveal' || !view.result || revealed.current === view.round) return;
    revealed.current = view.round;
    const mine = view.myTeam === null ? 0 : view.result.gained[view.myTeam];
    playSound(mine > 0 ? 'win' : 'signal');
  }, [view.phase, view.round, view.result, view.myTeam]);

  if (view.phase === 'over') return <GameOver view={view} playersById={playersById} isHost={isHost} />;

  return (
    <div className="cw">
      <div className="cw-scoreboard">
        <TeamPanel team={0} view={view} playersById={playersById} />
        <div className="cw-center">
          <TimerRing remaining={remaining} total={total} live={view.phase !== 'reveal'} small />
          <span className="tiny muted">Round {view.round + 1} / {view.totalRounds}</span>
        </div>
        <TeamPanel team={1} view={view} playersById={playersById} />
      </div>

      <Clues view={view} playersById={playersById} />
      <Board key={view.round} view={view} you={room.you} act={act} />
      {view.phase === 'reveal' && <Reveal view={view} act={act} />}
    </div>
  );
}

function TeamPanel({ team, view, playersById }: { team: 0 | 1; view: CodeWordsView; playersById: Players }) {
  const mine = view.myTeam === team;
  return (
    <div className={`cw-team ${team === 1 ? 'right' : ''} ${mine ? 'mine' : ''}`} style={{ '--team': TEAMS.colors[team] } as React.CSSProperties}>
      <div className="cw-team-head">
        <span className="cw-team-name">{TEAMS.names[team]}{mine && <small> · you</small>}</span>
        <motion.span key={view.scores[team]} className="cw-score" initial={{ scale: 1.5 }} animate={{ scale: 1 }}>
          {view.scores[team]}
        </motion.span>
      </div>
      <div className="cw-members">
        {view.teams[team].map((id) => {
          const p = playersById[id];
          if (!p) return null;
          const isCipher = view.cipherIds[team] === id;
          const ready = view.phase === 'guess' && view.locked.includes(id);
          return (
            <div key={id} className={`cw-member ${isCipher ? 'cipher' : ''} ${ready ? 'ready' : ''}`} title={isCipher ? `${p.name} is the cipher` : p.name}>
              <Avatar player={p} size={26} />
              <span className="cw-member-name">{p.name}</span>
              {isCipher && <span title="Cipher">🔐</span>}
              {ready && <span title="Locked in">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Clues({ view, playersById }: { view: CodeWordsView; playersById: Players }) {
  if (view.phase === 'clue') {
    return (
      <div className="cw-clues">
        {([0, 1] as const).map((t) => (
          <div key={t} className="cw-clue waiting" style={{ '--team': TEAMS.colors[t] } as React.CSSProperties}>
            <span className="tiny">{TEAMS.names[t]}</span>
            <span className="muted small">
              {view.clues[t] ? `“${view.clues[t]}” — sent` : view.clueSent[t] ? 'Clue sent ✓' : `${playersById[view.cipherIds[t]]?.name ?? 'The cipher'} is writing…`}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="cw-clues">
      {([0, 1] as const).map((t) => (
        <motion.div key={t} className="cw-clue" style={{ '--team': TEAMS.colors[t] } as React.CSSProperties} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: t * 0.1 }}>
          <span className="tiny">{TEAMS.names[t]}{view.myTeam === t ? ' · yours' : ''}</span>
          <span className="cw-clue-text">{view.clues[t] ? `“${view.clues[t]}”` : 'No clue sent'}</span>
        </motion.div>
      ))}
    </div>
  );
}

function Board({ view, you, act }: { view: CodeWordsView; you: string; act: Props['act'] }) {
  const [slot, setSlot] = useState<Slot>('crack');
  const canPick = view.phase === 'guess' && view.role === 'guesser' && !view.locked.includes(you);
  const myTeam = view.myTeam ?? 0;

  const choose = (index: number) => {
    if (!canPick) return;
    const clearing = view.myPicks[slot] === index;
    void act({ type: 'pick', slot, wordIndex: clearing ? null : index });
    // Jump to the other slot once this one is filled, so two taps finish the round.
    if (!clearing && slot === 'crack' && view.myPicks.intercept === null) setSlot('intercept');
  };

  const lock = async () => {
    if (await act({ type: 'lock' })) playSound('lockIn');
  };

  return (
    <>
      {canPick && (
        <div className="cw-slots">
          {(['crack', 'intercept'] as Slot[]).map((s) => (
            <button
              key={s}
              className={`cw-slot ${s} ${slot === s ? 'on' : ''}`}
              style={{ '--team': TEAMS.colors[s === 'crack' ? myTeam : other(myTeam)] } as React.CSSProperties}
              onClick={() => setSlot(s)}
            >
              <span className="tiny">{s === 'crack' ? `Our word · +${CRACK_POINTS}` : `Intercept · +${INTERCEPT_POINTS}`}</span>
              <b>{view.myPicks[s] === null ? 'Tap a word' : view.board[view.myPicks[s]!]}</b>
            </button>
          ))}
        </div>
      )}

      <div className="cw-grid">
        {view.board.map((word, i) => {
          const claimed = view.claimed[i];
          const isTarget = view.myTarget === i;
          const picked = view.myPicks.crack === i ? 'crack' : view.myPicks.intercept === i ? 'intercept' : null;
          const tint = claimed !== null ? TEAMS.colors[claimed] : picked ? TEAMS.colors[picked === 'crack' ? myTeam : other(myTeam)] : undefined;
          return (
            <button
              key={word}
              className={`cw-tile ${claimed !== null ? 'claimed' : ''} ${isTarget ? 'target' : ''} ${picked ? `picked ${picked}` : ''}`}
              style={tint ? ({ '--team': tint } as React.CSSProperties) : undefined}
              disabled={!canPick || claimed !== null}
              onClick={() => choose(i)}
            >
              <span className="cw-word">{word}</span>
              {isTarget && <span className="cw-flag">your word</span>}
              {picked && <span className="cw-flag">{picked === 'crack' ? 'ours' : 'theirs'}</span>}
              <span className="cw-tally">
                {(['crack', 'intercept'] as Slot[]).map((s) =>
                  view.tally[s][i] ? <i key={s} className={s} title={`${view.tally[s][i]} on your team`}>{view.tally[s][i]}</i> : null,
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cw-actions">
        {view.phase === 'clue' && view.role === 'cipher' && <ClueEntry view={view} act={act} />}
        {view.phase === 'clue' && view.role !== 'cipher' && (
          <p className="muted center">The ciphers are writing. Clues go out together, so nobody gets a head start.</p>
        )}
        {canPick && (
          <>
            <button className="btn btn-primary btn-lg" disabled={view.myPicks.crack === null && view.myPicks.intercept === null} onClick={lock}>
              🔒 Lock in
            </button>
            <span className="faint small">Numbers show where your teammates are leaning. Talk it over, or just commit.</span>
          </>
        )}
        {view.phase === 'guess' && !canPick && (
          <p className="muted center">
            {view.role === 'cipher'
              ? 'Your clue is out there. No hints — you’re off the chat until the reveal.'
              : view.role === 'spectator'
                ? 'You’re watching this game.'
                : `Locked in. Waiting for the rest (${view.locked.length}/${view.teams[0].length + view.teams[1].length - 2}).`}
          </p>
        )}
      </div>
    </>
  );
}

function ClueEntry({ view, act }: { view: CodeWordsView; act: Props['act'] }) {
  const [text, setText] = useState('');
  const sent = view.clues[view.myTeam ?? 0];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) void act({ type: 'clue', text });
  };
  if (sent) return <p className="muted center">Clue sent: <b>“{sent}”</b>. Waiting for the other cipher…</p>;
  return (
    <form onSubmit={submit} className="stack cw-entry">
      <p className="center cw-your-word">
        Your word is <b>{view.myTarget !== null ? view.board[view.myTarget] : '—'}</b>
      </p>
      <p className="muted center">One or two words that your team will read and theirs won’t.</p>
      <div className="row">
        <input className="input" autoFocus maxLength={32} placeholder="Your clue…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={!text.trim()}>Send</button>
      </div>
    </form>
  );
}

function Reveal({ view, act }: { view: CodeWordsView; act: Props['act'] }) {
  const r = view.result!;
  const last = view.round + 1 >= view.totalRounds;
  return (
    <motion.div className="panel cw-reveal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      {([0, 1] as const).map((t) => (
        <div key={t} className="cw-reveal-row" style={{ '--team': TEAMS.colors[t] } as React.CSSProperties}>
          <span className="cw-reveal-team">{TEAMS.names[t]}</span>
          <span className="grow small">
            {r.clues[t] ? <>“{r.clues[t]}” meant <b>{view.board[r.targets[t]]}</b></> : <span className="faint">never sent a clue</span>}
          </span>
          <span className={`cw-mark ${r.cracked[t] ? 'good' : 'bad'}`}>{r.cracked[t] ? `cracked +${CRACK_POINTS}` : 'missed'}</span>
          {r.intercepted[other(t)] && <span className="cw-mark warn">intercepted by {TEAMS.names[other(t)]}</span>}
        </div>
      ))}
      <div className="row spread">
        <span className="faint small">
          This round: {TEAMS.names[0]} +{r.gained[0]}, {TEAMS.names[1]} +{r.gained[1]}
        </span>
        {view.role !== 'spectator' && (
          <button className="btn btn-primary" onClick={() => act({ type: 'next', round: view.round })}>
            {last ? 'See the final score ▶' : 'Next round ▶'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function GameOver({ view, playersById, isHost }: { view: CodeWordsView; playersById: Players; isHost: boolean }) {
  const won = view.winner;
  const title = won === 'tie' ? 'A dead heat!' : `${TEAMS.names[won as 0 | 1]} wins!`;
  return (
    <div className="cw">
      <motion.div className="panel panel-pad cw-over" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <Confetti />
        <div style={{ fontSize: 60 }}>🔐</div>
        <h1 style={{ color: won === 'tie' ? undefined : TEAMS.colors[won as 0 | 1] }}>{title}</h1>
        <div className="cw-final">
          <span style={{ color: TEAMS.colors[0] }}>{view.scores[0]}</span>
          <span className="faint">—</span>
          <span style={{ color: TEAMS.colors[1] }}>{view.scores[1]}</span>
        </div>
        <div className="cw-rosters">
          {([0, 1] as const).map((t) => (
            <div key={t} className="cw-roster" style={{ '--team': TEAMS.colors[t] } as React.CSSProperties}>
              {view.teams[t].map((id) => {
                const p = playersById[id];
                return p ? <Avatar key={id} player={p} size={30} /> : null;
              })}
            </div>
          ))}
        </div>
        <AnimatePresence>
          {isHost ? (
            <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Play again</button>
          ) : (
            <span className="muted">Waiting for the host to start another game…</span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
