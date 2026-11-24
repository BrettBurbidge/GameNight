import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { FiresideAction, FiresideAward, FiresideView, Pick } from '../../../shared/games/fireside/types';
import { Avatar } from '../../components/Avatar';
import { request } from '../../lib/socket';
import { playSound } from '../../lib/sound';
import type { BoardProps } from '../types';
import './fireside.css';

type Props = BoardProps<FiresideView, FiresideAction>;
type Players = Props['playersById'];

const nameOf = (players: Players, id: string | null) => (id && players[id]?.name) || 'Someone';
const listNames = (players: Players, ids: string[]) => ids.map((id) => nameOf(players, id)).join(' and ');

export function FiresideBoard({ view, room, playersById, isHost, act }: Props) {
  // A flick for each new card, and a chime when the picks are turned over.
  const seq = useRef(view.seq);
  const revealed = useRef(view.revealed);
  useEffect(() => {
    if (seq.current !== view.seq) playSound('pageTurn');
    else if (view.revealed && !revealed.current) playSound('signal');
    seq.current = view.seq;
    revealed.current = view.revealed;
  }, [view.seq, view.revealed]);

  return (
    <div className="fs">
      {view.phase === 'cards' ? (
        <Table view={view} you={room.you} playersById={playersById} act={act} />
      ) : (
        <Embers view={view} playersById={playersById} isHost={isHost} />
      )}
    </div>
  );
}

function Table({ view, you, playersById, act }: { view: FiresideView; you: string; playersById: Players; act: Props['act'] }) {
  const card = view.card!;
  const holder = playersById[view.holderId];
  const holderName = nameOf(playersById, view.holderId);
  const isHolder = view.holderId === you;
  const holderAway = holder ? !holder.connected : true;
  const playing = view.role === 'player';
  const holds = playing && (isHolder || holderAway);
  const voting = card.kind !== 'open';
  const lastCard = view.cardNo >= view.totalCards;
  const wantsEnd = view.endVotes.includes(you);
  const canVote = playing && voting && !view.revealed;
  const vote = (pick: Pick) => act({ type: 'vote', seq: view.seq, pick });

  const kind = card.kind === 'open' ? 'Out loud' : card.kind === 'choice' ? 'Secret vote' : 'Name someone';
  const hint =
    card.kind === 'open'
      ? `${isHolder ? 'You go' : `${holderName} goes`} first, then round the fire`
      : view.revealed
        ? 'Now argue about it'
        : 'Pick in secret. Nobody sees until everyone’s in';

  return (
    <>
      <div className="fs-head">
        <span className="chip">{card.emoji} {card.deck}</span>
        {card.spicy && <span className="chip fs-spicy">18+</span>}
        <span className="grow" />
        <span className="tiny muted">Card {view.cardNo} of {view.totalCards}</span>
      </div>
      <div className="fs-progress"><i style={{ width: `${(view.cardNo / view.totalCards) * 100}%` }} /></div>

      <div className="fs-stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={view.seq}
            className={`fs-card ${card.spicy ? 'spicy' : ''}`}
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -24, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <div className="fs-card-top">
              {holder && <Avatar player={holder} size={30} />}
              <span><b>{isHolder ? 'Your' : `${holderName}’s`}</b> card</span>
              <span className="fs-kind">{kind}</span>
            </div>
            <p className="fs-question">{card.text}</p>
            <div className="fs-card-foot">{hint}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      {card.kind === 'choice' && !view.revealed && (
        <div className="fs-options">
          {card.options.map((label, i) => (
            <button key={i} className={`btn fs-option ${view.myPick === i ? 'on' : ''}`} disabled={!canVote} onClick={() => vote(i)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {card.kind === 'who' && !view.revealed && (
        <div className="fs-options">
          {view.order.map((id) => {
            const p = playersById[id];
            if (!p) return null;
            return (
              <button key={id} className={`btn fs-option fs-person ${view.myPick === id ? 'on' : ''}`} disabled={!canVote} onClick={() => vote(id)}>
                <Avatar player={p} size={28} /> {id === you ? 'Me' : p.name}
              </button>
            );
          })}
        </div>
      )}
      {voting && !view.revealed && (
        <span className="muted small fs-center">
          {view.myPick !== null ? 'Locked in. You can still change it. ' : ''}
          {view.voted.length} of {view.order.length} in
        </span>
      )}

      {view.revealed && view.picks && <Results view={view} picks={view.picks} you={you} playersById={playersById} />}

      <div className="fs-actions">
        {holds ? (
          <>
            {!view.revealed && (
              <button className="btn" onClick={() => act({ type: 'pass', seq: view.seq })} title="Swap this card for another. No explanation needed.">
                ↻ Swap card
              </button>
            )}
            {voting && !view.revealed ? (
              <button className="btn btn-primary btn-lg" disabled={view.voted.length === 0} onClick={() => act({ type: 'reveal', seq: view.seq })}>
                Reveal now
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={() => act({ type: 'next', seq: view.seq })}>
                {lastCard ? 'Let the fire burn down ▶' : 'Next card ▶'}
              </button>
            )}
          </>
        ) : (
          <span className="muted">
            {playing ? `${holderName} deals the next card when you’re all done talking.` : 'You’re watching this game.'}
          </span>
        )}
      </div>
      {holds && holderAway && !isHolder && <span className="faint small fs-center">{holderName} is away, so anyone can keep things moving.</span>}

      <div className="fs-foot">
        <div className="fs-circle">
          {view.order.map((id) => {
            const p = playersById[id];
            if (!p) return null;
            const done = voting && view.voted.includes(id);
            return (
              <div key={id} className={`fs-seat ${id === view.holderId ? 'holder' : ''} ${done ? 'done' : ''}`} title={p.name}>
                <Avatar player={p} size={28} />
                <span className="fs-seat-name">{p.name}</span>
                {done && <span>✓</span>}
              </div>
            );
          })}
        </div>
        {playing && (
          <button className={`btn btn-sm ${wantsEnd ? 'btn-good' : 'btn-ghost'}`} onClick={() => act({ type: 'end' })}>
            {wantsEnd ? '✓ ' : ''}Call it a night ({view.endVotes.length}/{view.endVotesNeeded})
          </button>
        )}
      </div>
    </>
  );
}

/** The picks, turned over: one row per option (or per named player), with the faces of whoever chose it. */
function Results({ view, picks, you, playersById }: { view: FiresideView; picks: Record<string, Pick>; you: string; playersById: Players }) {
  const card = view.card!;
  const voters = Object.keys(picks);
  const backers = (pick: Pick) => voters.filter((id) => picks[id] === pick);

  let rows: { key: string; label: string; pick: Pick; ids: string[] }[];
  if (card.kind === 'choice') {
    rows = card.options.map((label, i) => ({ key: String(i), label, pick: i, ids: backers(i) }));
  } else {
    rows = view.order
      .map((id) => ({ key: id, label: nameOf(playersById, id), pick: id as Pick, ids: backers(id) }))
      .filter((r) => r.ids.length > 0)
      .sort((a, b) => b.ids.length - a.ids.length);
  }
  const top = Math.max(...rows.map((r) => r.ids.length));

  return (
    <motion.div className="fs-results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <b className="fs-verdict">{verdict(card.kind, rows, voters.length, top, picks, playersById)}</b>
      {rows.map((r) => (
        <div key={r.key} className={`fs-row ${r.ids.length === top ? 'top' : ''} ${picks[you] === r.pick ? 'mine' : ''}`}>
          <i style={{ width: `${(r.ids.length / voters.length) * 100}%` }} />
          <span className="fs-row-label">{r.label}</span>
          <span className="fs-row-faces">
            {r.ids.map((id) => playersById[id] && <span key={id} title={playersById[id].name}><Avatar player={playersById[id]} size={24} /></span>)}
          </span>
          <b>{r.ids.length}</b>
        </div>
      ))}
    </motion.div>
  );
}

function verdict(
  kind: string,
  rows: { label: string; ids: string[] }[],
  voters: number,
  top: number,
  picks: Record<string, Pick>,
  playersById: Players,
) {
  const leaders = rows.filter((r) => r.ids.length === top);
  if (kind === 'who') {
    const selfish = Object.keys(picks).filter((id) => picks[id] === id);
    const self = selfish.length === 1 ? ` ${nameOf(playersById, selfish[0])} voted for ${nameOf(playersById, selfish[0])}.` : selfish.length ? ` ${listNames(playersById, selfish)} voted for themselves.` : '';
    if (leaders.length > 1) return `No agreement here. Make your case.${self}`;
    return `${top === voters && voters > 1 ? 'Unanimous: ' : ''}${leaders[0].label}, with ${top} of ${voters}.${self}`;
  }
  if (voters === 1) return 'Only one pick in. Everyone else, say yours out loud.';
  if (leaders.length === 1 && top === voters) return 'Unanimous. Too easy, or is somebody being polite?';
  const loners = rows.filter((r) => r.ids.length === 1);
  if (voters >= 3 && loners.length === 1 && rows.filter((r) => r.ids.length > 0).length === 2) {
    return `${nameOf(playersById, loners[0].ids[0])} stands alone. Defend it.`;
  }
  if (leaders.length > 1) return 'Dead even. Make your case.';
  return `${top} of ${voters} agree. The minority goes first.`;
}

const AWARDS: Record<FiresideAward['id'], { emoji: string; title: string; detail: (a: FiresideAward) => string }> = {
  kindred: { emoji: '🫶', title: 'Kindred spirits', detail: (a) => `Agreed on ${a.count} of ${a.of} votes` },
  wolf: { emoji: '🐺', title: 'Lone wolf', detail: (a) => `Outvoted ${a.count} times and unbothered` },
  named: { emoji: '🎯', title: 'Talk of the fire', detail: (a) => `Named ${a.count} times` },
};

function Embers({ view, playersById, isHost }: { view: FiresideView; playersById: Players; isHost: boolean }) {
  useEffect(() => playSound('pageTurn'), []);
  const votes = view.splits + view.unanimous;
  return (
    <motion.div className="fs-over" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="fs-center">
        <div style={{ fontSize: 56 }}>🔥</div>
        <h1 className="gradient-text">The fire’s burned down</h1>
        <span className="muted">
          {view.cardsPlayed} {view.cardsPlayed === 1 ? 'card' : 'cards'} round the fire
          {votes > 0 && `, ${view.splits} split ${view.splits === 1 ? 'vote' : 'votes'} and ${view.unanimous} unanimous`}.
        </span>
      </div>

      {view.awards.map((award, i) => {
        const meta = AWARDS[award.id];
        return (
          <motion.div key={award.id} className="panel fs-award" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.2 }}>
            <span className="fs-award-emoji">{meta.emoji}</span>
            <div className="grow">
              <span className="tiny muted">{meta.title}</span>
              <h3>{listNames(playersById, award.players)}</h3>
              <span className="muted small">{meta.detail(award)}</span>
            </div>
            <div className="fs-award-faces">
              {award.players.map((id) => playersById[id] && <Avatar key={id} player={playersById[id]} size={40} />)}
            </div>
          </motion.div>
        );
      })}

      <div className="fs-center">
        {isHost ? (
          <button className="btn btn-primary btn-lg" onClick={() => request('room:reset')}>Light it again</button>
        ) : (
          <span className="muted">Waiting for the host to start another game…</span>
        )}
      </div>
    </motion.div>
  );
}
