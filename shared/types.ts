// Types shared by the client and the realtime server.

export type PlayerId = string;

/** A guest identity kept in the browser. No accounts: the secret proves you own the id on reconnect. */
export interface Identity {
  id: PlayerId;
  secret: string;
  name: string;
  avatar: string;
}

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  connected: boolean;
  spectator: boolean;
  team: number | null;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export type GameConfig = Record<string, string | number | boolean>;

export interface ChatMessage {
  id: string;
  /** null for system announcements. */
  playerId: PlayerId | null;
  text: string;
  ts: number;
}

/** The personalised room state each client receives. `view` is whatever the game exposes to that player. */
export interface RoomSnapshot<V = unknown> {
  code: string;
  gameId: string;
  status: RoomStatus;
  hostId: PlayerId;
  you: PlayerId;
  players: PlayerInfo[];
  config: GameConfig;
  view: V | null;
  chat: ChatMessage[];
  serverNow: number;
}

export interface RoomPeek {
  code: string;
  gameId: string;
  status: RoomStatus;
  playerCount: number;
  hostName: string;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };
