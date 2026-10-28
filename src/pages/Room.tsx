import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getGameMeta } from '../../shared/catalog';
import type { PlayerInfo, RoomPeek } from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { NameGate } from '../components/NameGate';
import { BOARDS } from '../games/registry';
import { useIdentity } from '../lib/identity';
import { accentStyle } from '../lib/site';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import { useRoom } from '../lib/useRoom';
import { GameLayout } from './GameLayout';
import { Lobby } from './Lobby';
import './Room.css';

export function Room() {
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  const [identity] = useIdentity();
  const [peek, setPeek] = useState<RoomPeek | null>(null);
  const [nameDone, setNameDone] = useState(!!identity.name);
  const { state, connected, serverNow } = useRoom(upper, identity, nameDone && !!identity.name);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (nameDone) return;
    request<{ room: RoomPeek }>('room:peek', { code: upper }).then((res) => res.ok && setPeek(res.room));
  }, [upper, nameDone]);

  // Leaving the page frees a lobby seat (mid-game seats are kept so you can come back).
  useEffect(() => () => void request('room:leave'), [upper]);

  const room = state.kind === 'ready' ? state.room : null;
  const meta = getGameMeta(room?.gameId ?? peek?.gameId ?? '');
  const playersById = useMemo(
    () => Object.fromEntries((room?.players ?? []).map((p) => [p.id, p])) as Record<string, PlayerInfo>,
    [room?.players],
  );

  const act = useCallback(
    async (action: unknown) => {
      const res = await request('game:action', { action });
      if (!res.ok) toast(res.error, 'error');
      return res.ok;
    },
    [toast],
  );

  if (!nameDone || !identity.name) {
    const invitedMeta = getGameMeta(peek?.gameId ?? '');
    return (
      <AppShell>
        <NameGate
          title={invitedMeta ? `Join ${peek?.hostName ? `${peek.hostName}’s` : 'the'} ${invitedMeta.name} game` : 'Join the game'}
          subtitle={`Room ${upper}${peek ? ` · ${peek.playerCount} player${peek.playerCount === 1 ? '' : 's'} here` : ''}. Pick a name — no account needed.`}
          onDone={() => setNameDone(true)}
          onCancel={() => navigate('/')}
        />
      </AppShell>
    );
  }

  if (state.kind === 'error' || state.kind === 'kicked') {
    return (
      <AppShell>
        <div className="container center room-message">
          <div className="panel panel-pad stack" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>{state.kind === 'kicked' ? '👋' : '🔍'}</div>
            <h2>{state.kind === 'kicked' ? 'You were removed from the room' : 'Can’t join that room'}</h2>
            {state.kind === 'error' && <p className="muted">{state.message}</p>}
            <Link to="/" className="btn btn-primary">Back to games</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!room || !meta) {
    return (
      <AppShell>
        <div className="container center room-message">
          <div className="loader" />
        </div>
      </AppShell>
    );
  }

  const isHost = room.hostId === room.you;
  const Board = BOARDS[room.gameId];
  const leave = () => {
    request('room:leave');
    navigate('/');
  };

  const headerRight = (
    <>
      {!connected && <span className="chip" style={{ color: 'var(--warn)' }}>Reconnecting…</span>}
      <span className="chip chip-accent">{meta.emoji} {meta.name} · {room.code}</span>
      <button className="btn btn-sm btn-ghost" onClick={leave}>Leave</button>
    </>
  );

  return (
    <div style={accentStyle(meta.accent)}>
      <AppShell right={headerRight}>
        {room.status === 'lobby' ? (
          <Lobby room={room} meta={meta} playersById={playersById} />
        ) : (
          <GameLayout room={room} meta={meta} playersById={playersById} isHost={isHost}>
            {Board && room.view ? (
              <Board room={room} view={room.view} me={playersById[room.you]} isHost={isHost} playersById={playersById} act={act} serverNow={serverNow} />
            ) : (
              <div className="center muted">This game’s board isn’t available.</div>
            )}
          </GameLayout>
        )}
      </AppShell>
    </div>
  );
}
