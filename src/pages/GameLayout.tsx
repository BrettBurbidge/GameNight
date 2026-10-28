import { useState, type ReactNode } from 'react';
import type { GameMeta } from '../../shared/catalog';
import type { PlayerInfo, RoomSnapshot } from '../../shared/types';
import { Chat } from '../components/Chat';
import { InviteCard } from '../components/InviteCard';
import { PlayerRow } from '../components/PlayerList';
import { request } from '../lib/socket';

/** Shared in-game chrome: the board on the left, players + chat + invite in a drawer on the right. */
export function GameLayout({ room, meta, playersById, isHost, children }: { room: RoomSnapshot; meta: GameMeta; playersById: Record<string, PlayerInfo>; isHost: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'players'>('chat');

  return (
    <div className="game-layout container">
      <div className="game-board">{children}</div>
      <button className="btn sidebar-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '✕ Close' : '💬 Chat & players'}
      </button>
      <aside className={`game-sidebar panel ${open ? 'open' : ''}`}>
        <div className="tabs">
          <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>Players ({room.players.length})</button>
        </div>
        {tab === 'chat' ? (
          <Chat messages={room.chat} playersById={playersById} compact />
        ) : (
          <div className="stack scroll sidebar-players" style={{ '--gap': '6px' } as React.CSSProperties}>
            {room.players.map((p) => (
              <PlayerRow key={p.id} player={p} hostId={room.hostId} you={room.you} isHost={isHost} />
            ))}
            {isHost && (
              <>
                <hr className="divider" />
                <span className="faint small">Removing a player mid-game hands their seat to a bot where the game supports it.</span>
                <button className="btn btn-sm" onClick={() => request('room:reset')}>↩ End game &amp; return to lobby</button>
              </>
            )}
            <hr className="divider" />
            <InviteCard code={room.code} gameName={meta.name} />
          </div>
        )}
      </aside>
    </div>
  );
}
