import type { PlayerInfo } from '../../shared/types';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import { Avatar } from './Avatar';
import { useEditProfile } from './ProfileEditor';

export function PlayerRow({ player, hostId, you, isHost, extra, status }: { player: PlayerInfo; hostId: string; you: string; isHost: boolean; extra?: React.ReactNode; status?: React.ReactNode }) {
  const toast = useToast();
  const editProfile = useEditProfile();
  const kick = async () => {
    const res = await request('room:kick', { playerId: player.id });
    if (!res.ok) toast(res.error, 'error');
  };
  return (
    <div className="player-row">
      <Avatar player={player} size={34} showStatus={!player.isBot} />
      <div className="grow">
        {player.id === you ? (
          <button className="player-name player-name-edit" onClick={editProfile} title="Edit your name and avatar">
            {player.name}
            <span className="faint"> (you) ✎</span>
          </button>
        ) : (
          <div className="player-name">{player.name}</div>
        )}
        <div className="player-meta">
          {player.id === hostId && <span>👑 Host</span>}
          {player.isBot && <span>Bot</span>}
          {!player.connected && <span>Offline</span>}
          {player.spectator && <span>Watching</span>}
          {status}
        </div>
      </div>
      {extra}
      {isHost && player.id !== you && (
        <button className="btn btn-ghost btn-icon btn-sm kick" title={player.isBot ? 'Remove bot' : 'Remove player'} onClick={kick}>✕</button>
      )}
    </div>
  );
}
