import type { PlayerInfo, RoomSnapshot } from '../../shared/types';

export interface BoardProps<V = any, A = any> {
  room: RoomSnapshot<V>;
  view: V;
  me: PlayerInfo | undefined;
  isHost: boolean;
  playersById: Record<string, PlayerInfo>;
  /** Sends a game action; errors are toasted automatically. Resolves true on success. */
  act: (action: A) => Promise<boolean>;
  serverNow: () => number;
}
