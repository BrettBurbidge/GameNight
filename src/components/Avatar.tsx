import type { PlayerInfo } from '../../shared/types';

export function Avatar({ player, size = 40, showStatus = false }: { player: Pick<PlayerInfo, 'avatar' | 'color' | 'connected'>; size?: number; showStatus?: boolean }) {
  return (
    <div
      className={`avatar ${player.connected ? '' : 'offline'}`}
      style={{ '--size': `${size}px`, '--c': player.color } as React.CSSProperties}
    >
      {player.avatar}
      {showStatus && player.connected && <span className="dot" />}
    </div>
  );
}
