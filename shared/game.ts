import type { GameConfig, PlayerId, PlayerInfo } from './types';

/** Passed to every game hook so game logic stays pure and testable (no Date.now / Math.random inside games). */
export interface GameContext {
  now: number;
  random(): number;
  /** Posts a system line into the room chat. */
  announce(text: string): void;
  /** Whether a player currently has the room open. */
  isConnected(playerId: PlayerId): boolean;
}

/**
 * Server-side contract every game implements. The room manager owns lobbies, seats,
 * invites, chat, bots and timers; a game only owns its own state.
 *
 * State is mutated in place. Hooks that can fail return an error string.
 */
export interface GameDefinition<S = any, A = any, V = any> {
  id: string;

  /** Extra lobby checks beyond the min/max player counts in the catalog. */
  validateStart?(players: PlayerInfo[], config: GameConfig): string | null;

  setup(players: PlayerInfo[], config: GameConfig, ctx: GameContext): S;

  action(state: S, playerId: PlayerId, action: A, ctx: GameContext): string | void;

  /** What a given player is allowed to see. Must strip hidden information. */
  view(state: S, viewerId: PlayerId): V;

  /** Called a few times per second while playing; return true if state changed (timers, pauses). */
  tick?(state: S, ctx: GameContext): boolean;

  /** Return the action a bot wants to take right now, or null if it is not its move. */
  bot?(state: S, botId: PlayerId, ctx: GameContext): A | null;

  /** How long bots "think" before acting, in ms. */
  botDelay?(state: S): number;

  /** Someone joins mid-game. Return the team they landed on, or false to make them a spectator. */
  addPlayer?(state: S, player: PlayerInfo, ctx: GameContext): { team: number | null } | false;

  /** Hand a seat to someone else (bot -> late joiner, or dropped human -> bot). */
  swapPlayer?(state: S, fromId: PlayerId, toId: PlayerId): void;

  /**
   * High-frequency data (e.g. brush strokes) that skips the full-snapshot broadcast.
   * Validate and record it, then return what to relay to everyone else in the room, or null to drop it.
   */
  stream?(state: S, playerId: PlayerId, data: unknown, ctx: GameContext): unknown | null;

  /** Everything streamed so far, for players who join or reconnect mid-stream. */
  streamSync?(state: S, playerId: PlayerId): unknown;

  /** Return an error to block a room chat message (e.g. one that spoils the answer). */
  filterChat?(state: S, playerId: PlayerId, text: string): string | null;

  isFinished(state: S): boolean;
}
