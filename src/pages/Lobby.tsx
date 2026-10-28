import { AnimatePresence, motion } from 'framer-motion';
import type { GameMeta } from '../../shared/catalog';
import type { PlayerInfo, RoomSnapshot } from '../../shared/types';
import { Chat } from '../components/Chat';
import { ConfigPanel } from '../components/ConfigPanel';
import { InviteCard } from '../components/InviteCard';
import { PlayerRow } from '../components/PlayerList';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';

export function Lobby({ room, meta, playersById }: { room: RoomSnapshot; meta: GameMeta; playersById: Record<string, PlayerInfo> }) {
  const toast = useToast();
  const isHost = room.hostId === room.you;
  const active = room.players.filter((p) => !p.spectator);
  const humans = active.filter((p) => !p.isBot).length;
  const teamsChosen = !meta.teams?.whenConfig || room.config[meta.teams.whenConfig.key] === meta.teams.whenConfig.value;
  const showTeams = !!meta.teams && teamsChosen && active.length >= (meta.teams.from ?? 0);

  const call = async (event: string, payload: object = {}) => {
    const res = await request(event, payload);
    if (!res.ok) toast(res.error, 'error');
  };

  const seatsNote = meta.fillWithBots
    ? `${humans} of ${meta.maxPlayers} seats filled by people${active.length < meta.maxPlayers ? ' — bots take the rest' : ''}`
    : `${active.length} / ${meta.maxPlayers} players${active.length < meta.minPlayers ? ` · need ${meta.minPlayers}+` : ''}`;

  const row = (p: PlayerInfo, extra?: React.ReactNode) => (
    <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
      <PlayerRow player={p} hostId={room.hostId} you={room.you} isHost={isHost} extra={extra} />
    </motion.div>
  );

  return (
    <div className="lobby container">
      <div className="lobby-main stack" style={{ '--gap': '16px' } as React.CSSProperties}>
        <div className="panel panel-pad stack">
          <div className="row spread wrap">
            <div>
              <h2>Lobby</h2>
              <span className="muted small">{seatsNote}</span>
            </div>
            <div className="row">
              {isHost && showTeams && <button className="btn btn-sm" onClick={() => call('room:shuffleTeams')}>🔀 Shuffle teams</button>}
              {isHost && meta.bots && active.length < meta.maxPlayers && (
                <button className="btn btn-sm" onClick={() => call('room:addBot')}>🤖 Add bot</button>
              )}
            </div>
          </div>

          {meta.teams?.from && active.length < meta.teams.from && !meta.teams.whenConfig && (
            <div className="lobby-note">
              🤝 With fewer than {meta.teams.from} players you’ll all play together as one team. Once {meta.teams.from}+ join, you’ll split into rival teams.
            </div>
          )}
          {meta.teams?.whenConfig && teamsChosen && active.length < (meta.teams.from ?? 0) && (
            <div className="lobby-note">
              Teams need at least {meta.teams.from} players. Until more people join, you’ll play everyone-for-themselves.
            </div>
          )}
          {showTeams ? (
            <div className="team-columns">
              {meta.teams!.names.map((name, t) => {
                const members = active.filter((p) => p.team === t);
                const mine = playersById[room.you]?.team === t;
                return (
                  <div key={name} className="team-col" style={{ '--team': meta.teams!.colors[t] } as React.CSSProperties}>
                    <div className="row spread">
                      <h3 className="team-name">{name}</h3>
                      <span className="chip">{members.length}</span>
                    </div>
                    <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
                      <AnimatePresence>
                        {members.map((p) =>
                          row(
                            p,
                            isHost && p.id !== room.you ? (
                              <button className="btn btn-ghost btn-sm" title="Move to other team" onClick={() => call('room:team', { playerId: p.id, team: 1 - t })}>⇄</button>
                            ) : undefined,
                          ),
                        )}
                      </AnimatePresence>
                    </div>
                    {!mine && (
                      <button className="btn btn-sm team-join" onClick={() => call('room:team', { playerId: room.you, team: t })}>Join {name}</button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="seat-grid">
              <AnimatePresence>
                {active.map((p) => row(p))}
                {Array.from({ length: Math.max(0, (meta.fillWithBots ? meta.maxPlayers : Math.max(meta.minPlayers, active.length)) - active.length) }, (_, i) => (
                  <motion.div key={`empty-${i}`} className="player-row empty" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="avatar" style={{ '--size': '34px', '--c': 'rgba(255,255,255,.2)' } as React.CSSProperties}>
                      {meta.fillWithBots ? '🤖' : '·'}
                    </div>
                    <span className="faint small">{meta.fillWithBots ? 'Open seat — a bot will play' : 'Waiting for a friend…'}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <hr className="divider" />
          <ConfigPanel meta={meta} config={room.config} editable={isHost} />
        </div>

        <div className="panel panel-pad lobby-chat">
          <Chat messages={room.chat} playersById={playersById} />
        </div>
      </div>

      <aside className="lobby-side stack" style={{ '--gap': '16px' } as React.CSSProperties}>
        <InviteCard code={room.code} gameName={meta.name} />
        <div className="panel panel-pad stack start-card">
          {isHost ? (
            <>
              <button className="btn btn-primary btn-lg" onClick={() => call('room:start')}>Start game</button>
              <span className="faint small" style={{ textAlign: 'center' }}>Anyone with the link can still join after you start.</span>
            </>
          ) : (
            <div className="waiting">
              <span className="pulse-dot" /> Waiting for {playersById[room.hostId]?.name ?? 'the host'} to start…
            </div>
          )}
        </div>
        {meta.howToPlay && (
          <details className="panel panel-pad rules">
            <summary>How to play {meta.name}</summary>
            <ol>
              {meta.howToPlay.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </details>
        )}
      </aside>
    </div>
  );
}
