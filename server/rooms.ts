import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { defaultConfig, getGameMeta, type GameMeta } from '../shared/catalog';
import type { GameContext, GameDefinition } from '../shared/game';
import type { ChatMessage, GameConfig, Identity, PlayerId, PlayerInfo, RoomPeek, RoomSnapshot, RoomStatus } from '../shared/types';
import { GAME_DEFINITIONS } from './registry';

interface RoomPlayer extends PlayerInfo {
  secret: string | null;
  sockets: Set<string>;
  joinedAt: number;
  /** A spectator who chose to watch, so they aren't pulled into open seats automatically. */
  watchByChoice: boolean;
}

interface Room {
  code: string;
  gameId: string;
  meta: GameMeta;
  def: GameDefinition;
  hostId: PlayerId;
  status: RoomStatus;
  players: RoomPlayer[];
  config: GameConfig;
  state: unknown;
  chat: ChatMessage[];
  lastActive: number;
  botTimer: NodeJS.Timeout | null;
}

// No 0/O/1/I/L so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PLAYER_COLORS = ['#f472b6', '#38bdf8', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#2dd4bf', '#f97316', '#818cf8', '#4ade80', '#facc15', '#e879f9', '#60a5fa', '#f87171', '#34d399', '#fcd34d'];
const BOT_PERSONAS = [
  { name: 'Robo Rita', avatar: '🤖' },
  { name: 'Chip', avatar: '👾' },
  { name: 'Dealer Dan', avatar: '🎩' },
  { name: 'Byte', avatar: '🦾' },
  { name: 'Ace', avatar: '🛸' },
  { name: 'Gizmo', avatar: '⚙️' },
];
const MAX_CHAT = 100;
const IDLE_ROOM_MS = 1000 * 60 * 60 * 3;
const LOBBY_GRACE_MS = 30_000;
/** Seated players plus spectators. */
const MAX_PEOPLE_PER_ROOM = 40;

const sanitizeName = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
const sanitizeAvatar = (s: unknown) => [...String(s ?? '')].slice(0, 2).join('') || '🙂';

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private io: Server) {
    setInterval(() => this.tickAll(), 250);
    setInterval(() => this.sweep(), 60_000);
  }

  // ---------- connection handling ----------

  attach(socket: Socket) {
    const on = <T>(event: string, handler: (payload: T) => unknown) => {
      socket.on(event, (payload: T, ack?: (res: unknown) => void) => {
        try {
          const result = handler(payload);
          const res = typeof result === 'string' ? { ok: false, error: result } : { ok: true, ...(result as object) };
          ack?.(res);
        } catch (err) {
          console.error(`[${event}]`, err);
          ack?.({ ok: false, error: 'Something went wrong.' });
        }
      });
    };

    on<{ code: string }>('room:peek', ({ code }) => {
      const room = this.rooms.get(String(code).toUpperCase());
      if (!room) return 'That room code does not exist (or the game has ended).';
      const peek: RoomPeek = {
        code: room.code,
        gameId: room.gameId,
        status: room.status,
        playerCount: room.players.filter((p) => !p.spectator).length,
        hostName: this.player(room, room.hostId)?.name ?? '',
      };
      return { room: peek };
    });

    on<{ gameId: string; identity: Identity }>('room:create', ({ gameId, identity }) => {
      const meta = getGameMeta(gameId);
      const def = GAME_DEFINITIONS[gameId];
      if (!meta || !def || meta.status !== 'live') return 'That game is not available yet.';
      const err = this.checkIdentity(identity);
      if (err) return err;
      const room: Room = {
        code: this.newCode(),
        gameId,
        meta,
        def,
        hostId: identity.id,
        status: 'lobby',
        players: [],
        config: defaultConfig(meta),
        state: null,
        chat: [],
        lastActive: Date.now(),
        botTimer: null,
      };
      this.rooms.set(room.code, room);
      console.log(`room ${room.code} created for ${gameId}`);
      return { code: room.code };
    });

    on<{ code: string; identity: Identity }>('room:join', ({ code, identity }) => {
      const room = this.rooms.get(String(code).toUpperCase());
      if (!room) return 'That room code does not exist (or the game has ended).';
      const err = this.checkIdentity(identity);
      if (err) return err;
      if (socket.data.code && socket.data.code !== room.code) this.leave(socket);
      const joinErr = this.join(room, socket, identity);
      if (joinErr) return joinErr;
      return { code: room.code };
    });

    on('room:leave', () => {
      this.leave(socket, true);
      return {};
    });

    on<{ config: GameConfig }>('room:config', ({ config }) =>
      this.asHost(socket, (room) => {
        if (room.status !== 'lobby') return 'Settings are locked once the game starts.';
        for (const opt of room.meta.config ?? []) {
          const value = config?.[opt.key];
          if (value !== undefined && opt.options.some((o) => o.value === value)) room.config[opt.key] = value;
        }
      }),
    );

    on<{ playerId: PlayerId; team: number }>('room:team', ({ playerId, team }) =>
      this.inRoom(socket, (room, me) => {
        if (room.status !== 'lobby' || !room.meta.teams) return 'Teams can only change in the lobby.';
        if (playerId !== me.id && room.hostId !== me.id) return 'Only the host can move other players.';
        const target = this.player(room, playerId);
        if (!target || team < 0 || team >= room.meta.teams.names.length) return 'Invalid team.';
        target.team = team;
        target.spectator = false;
      }),
    );

    on('room:shuffleTeams', () =>
      this.asHost(socket, (room) => {
        if (room.status !== 'lobby' || !room.meta.teams) return 'Nothing to shuffle.';
        const active = room.players.filter((p) => !p.spectator).sort(() => Math.random() - 0.5);
        active.forEach((p, i) => (p.team = i % room.meta.teams!.names.length));
      }),
    );

    on('room:addBot', () =>
      this.asHost(socket, (room) => {
        if (room.status !== 'lobby' || !room.meta.bots) return 'Bots are not available here.';
        if (this.activeCount(room) >= room.meta.maxPlayers) return 'The table is full.';
        this.addBot(room);
      }),
    );

    on<{ playerId: PlayerId }>('room:kick', ({ playerId }) =>
      this.asHost(socket, (room, me) => {
        const target = this.player(room, playerId);
        if (!target || target.id === me.id) return 'Cannot remove that player.';
        if (room.status !== 'lobby' && !target.spectator) {
          return this.replaceWithBot(room, target) ?? undefined;
        }
        for (const sid of target.sockets) {
          const s = this.io.sockets.sockets.get(sid);
          s?.emit('room:kicked');
          if (s) s.data.code = undefined;
        }
        room.players = room.players.filter((p) => p.id !== playerId);
        if (!target.isBot) this.announce(room, `${target.name} was removed by the host.`);
        if (room.status === 'lobby') this.fillOpenSeats(room);
      }),
    );

    // Move a spectator into a seat (host, or the spectator themselves).
    on<{ playerId: PlayerId }>('room:seat', ({ playerId }) =>
      this.inRoom(socket, (room, me) => {
        if (room.status !== 'lobby') return 'Seats can only change in the lobby.';
        if (playerId !== me.id && room.hostId !== me.id) return 'Only the host can seat other players.';
        const target = this.player(room, playerId);
        if (!target || !target.spectator) return 'That player is already seated.';
        const err = this.seatSpectator(room, target);
        if (err) return err;
        this.announce(room, `${target.name} took a seat.`);
      }),
    );

    // Move a seated player to the watchers (host, or the player themselves).
    on<{ playerId: PlayerId }>('room:watch', ({ playerId }) =>
      this.inRoom(socket, (room, me) => {
        if (room.status !== 'lobby') return 'Seats can only change in the lobby.';
        if (playerId !== me.id && room.hostId !== me.id) return 'Only the host can move other players.';
        const target = this.player(room, playerId);
        if (!target || target.isBot || target.spectator) return 'That player is already watching.';
        target.spectator = true;
        target.watchByChoice = true;
        target.team = null;
        this.announce(room, `${target.name} is watching${playerId === me.id ? '' : ' (moved by the host)'}.`);
        this.fillOpenSeats(room);
      }),
    );

    on<{ playerId: PlayerId }>('room:makeHost', ({ playerId }) =>
      this.asHost(socket, (room) => {
        const target = this.player(room, playerId);
        if (!target || target.isBot) return 'Cannot make that player host.';
        room.hostId = target.id;
        this.announce(room, `${target.name} is now the host.`);
      }),
    );

    on('room:start', () =>
      this.asHost(socket, (room) => {
        if (room.status !== 'lobby') return 'The game has already started.';
        if (room.meta.fillWithBots) while (this.activeCount(room) < room.meta.maxPlayers) this.addBot(room);
        const active = room.players.filter((p) => !p.spectator);
        if (active.length < room.meta.minPlayers) return `${room.meta.name} needs at least ${room.meta.minPlayers} players.`;
        if (active.length > room.meta.maxPlayers) return `${room.meta.name} allows at most ${room.meta.maxPlayers} players.`;
        const err = room.def.validateStart?.(active.map(publicInfo), room.config);
        if (err) return err;
        room.state = room.def.setup(active.map(publicInfo), room.config, this.ctx(room));
        room.status = 'playing';
        this.announce(room, `Game on! ${room.meta.emoji}`);
      }),
    );

    on('room:reset', () =>
      this.asHost(socket, (room) => {
        this.clearBotTimer(room);
        room.status = 'lobby';
        room.state = null;
        room.players = room.players.filter((p) => p.isBot || p.connected || p.id === room.hostId);
        this.announce(room, 'Back to the lobby.');
        // People who arrived mid-game get first dibs on open or bot seats for the next game.
        this.fillOpenSeats(room, { replaceBots: true });
      }),
    );

    on<{ action: unknown }>('game:action', ({ action }) =>
      this.inRoom(socket, (room, me) => {
        if (room.status !== 'playing') return 'The game is not running.';
        return this.applyAction(room, me.id, action) ?? undefined;
      }),
    );

    // Live game data: relayed to the rest of the room without a full snapshot broadcast.
    socket.on('game:stream', (data: unknown) => {
      const room = socket.data.code ? this.rooms.get(socket.data.code) : undefined;
      if (!room || room.status !== 'playing' || !room.def.stream || !socket.data.playerId) return;
      try {
        const out = room.def.stream(room.state, socket.data.playerId, data, this.ctx(room));
        if (out !== null && out !== undefined) socket.to(room.code).emit('game:stream', out);
        room.lastActive = Date.now();
      } catch (err) {
        console.error('[game:stream]', err);
      }
    });

    on('game:stream-sync', () =>
      this.inRoom(socket, (room, me) => {
        if (room.status === 'lobby' || !room.def.streamSync) return { data: null };
        return { data: room.def.streamSync(room.state, me.id) };
      }),
    );

    on<{ text: string }>('chat:send', ({ text }) =>
      this.inRoom(socket, (room, me) => {
        const clean = String(text ?? '').trim().slice(0, 300);
        if (!clean) return;
        if (room.status === 'playing' && room.def.filterChat) {
          const blocked = room.def.filterChat(room.state, me.id, clean);
          if (blocked) return blocked;
        }
        this.pushChat(room, { id: randomUUID(), playerId: me.id, text: clean, ts: Date.now() });
      }),
    );

    socket.on('disconnect', () => this.leave(socket));
  }

  // ---------- room operations ----------

  private join(room: Room, socket: Socket, identity: Identity): string | void {
    let player = this.player(room, identity.id);
    if (player && player.secret !== identity.secret) return 'That seat belongs to someone else.';

    if (!player) {
      if (room.players.filter((p) => !p.isBot).length >= MAX_PEOPLE_PER_ROOM) return 'This room is full.';
      player = {
        id: identity.id,
        secret: identity.secret,
        name: this.uniqueName(room, sanitizeName(identity.name)),
        avatar: sanitizeAvatar(identity.avatar),
        color: this.nextColor(room),
        isBot: false,
        connected: true,
        spectator: false,
        team: null,
        sockets: new Set(),
        joinedAt: Date.now(),
        watchByChoice: false,
      };
      if (room.status === 'lobby') {
        // Take an open seat (or a bot's); if the table is full of people, wait as a spectator.
        if (this.activeCount(room) >= room.meta.maxPlayers) {
          const bot = room.players.find((p) => p.isBot && !p.spectator);
          if (bot) room.players = room.players.filter((p) => p !== bot);
          else player.spectator = true;
        }
        if (room.meta.teams && !player.spectator) player.team = this.smallestTeam(room);
        room.players.push(player);
      } else {
        room.players.push(player);
        this.seatLateJoiner(room, player);
      }
      this.announce(room, `${player.name} joined${player.spectator ? ' as a spectator' : ''}.`);
    } else {
      const wanted = sanitizeName(identity.name);
      if (wanted && wanted !== player.name) {
        const renamed = this.uniqueName(room, wanted, player);
        if (renamed !== player.name) this.announce(room, `${player.name} is now ${renamed}.`);
        player.name = renamed;
      }
      player.avatar = sanitizeAvatar(identity.avatar);
    }

    player.connected = true;
    player.sockets.add(socket.id);
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    if (!this.player(room, room.hostId)) room.hostId = player.id;
    this.changed(room);
  }

  /** Mid-game arrivals take over a bot seat, join a team, or watch. */
  private seatLateJoiner(room: Room, player: RoomPlayer) {
    const bot = room.players.find((p) => p.isBot && !p.spectator);
    if (bot && room.def.swapPlayer) {
      room.def.swapPlayer(room.state, bot.id, player.id);
      player.team = bot.team;
      room.players = room.players.filter((p) => p !== bot);
      return;
    }
    const seat = room.def.addPlayer?.(room.state, publicInfo(player), this.ctx(room));
    if (seat) player.team = seat.team;
    else player.spectator = true;
  }

  private replaceWithBot(room: Room, target: RoomPlayer): string | null {
    if (!room.def.swapPlayer || !room.meta.bots) return 'Players cannot be replaced mid-game in this game.';
    const bot = this.addBot(room);
    bot.team = target.team;
    room.def.swapPlayer(room.state, target.id, bot.id);
    room.players = room.players.filter((p) => p !== target);
    for (const sid of target.sockets) this.io.sockets.sockets.get(sid)?.emit('room:kicked');
    this.announce(room, `${bot.name} took over for ${target.name}.`);
    return null;
  }

  private leave(socket: Socket, explicit = false) {
    const room = socket.data.code ? this.rooms.get(socket.data.code) : undefined;
    socket.data.code = undefined;
    if (!room) return;
    socket.leave(room.code);
    const player = this.player(room, socket.data.playerId);
    if (!player) return;
    player.sockets.delete(socket.id);
    if (player.sockets.size > 0) return;

    player.connected = false;
    if (explicit) this.drop(room, player);
    else {
      // Give refreshes and flaky connections a moment before freeing a lobby seat.
      setTimeout(() => {
        if (!player.connected && this.rooms.get(room.code) === room) this.drop(room, player);
      }, LOBBY_GRACE_MS);
      this.changed(room);
    }
  }

  /** A player is gone for good: free their lobby seat (mid-game they keep it and can return). */
  private drop(room: Room, player: RoomPlayer) {
    if (room.status === 'lobby' || player.spectator) {
      if (!room.players.includes(player)) return;
      room.players = room.players.filter((p) => p !== player);
      this.announce(room, `${player.name} left.`);
      if (room.status === 'lobby' && !player.spectator) this.fillOpenSeats(room);
    } else {
      this.announce(room, `${player.name} disconnected.`);
    }
    if (room.hostId === player.id) {
      const next = room.players.find((p) => !p.isBot && p.connected);
      if (next) {
        room.hostId = next.id;
        this.announce(room, `${next.name} is now the host.`);
      }
    }
    // Seated humans keep the room alive so they can rejoin; the sweeper closes abandoned rooms.
    if (room.players.every((p) => p.isBot)) {
      this.destroy(room);
      return;
    }
    this.changed(room);
  }

  private applyAction(room: Room, playerId: PlayerId, action: unknown): string | null {
    const err = room.def.action(room.state, playerId, action, this.ctx(room));
    if (err) return err;
    this.changed(room);
    return null;
  }

  /** Seats a spectator in an open seat, or in place of a bot. */
  private seatSpectator(room: Room, p: RoomPlayer): string | null {
    if (this.activeCount(room) >= room.meta.maxPlayers) {
      const bot = room.players.find((b) => b.isBot && !b.spectator);
      if (!bot) return 'There are no open seats.';
      room.players = room.players.filter((b) => b !== bot);
    }
    p.spectator = false;
    p.watchByChoice = false;
    p.team = room.meta.teams ? this.smallestTeam(room) : null;
    return null;
  }

  /** Lobby only: moves waiting spectators (longest-waiting first) into open seats. */
  private fillOpenSeats(room: Room, { replaceBots = false } = {}) {
    const waiting = room.players
      .filter((p) => p.spectator && !p.isBot && !p.watchByChoice && p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    for (const p of waiting) {
      const open = this.activeCount(room) < room.meta.maxPlayers;
      const botSeat = replaceBots && room.players.some((b) => b.isBot && !b.spectator);
      if (!open && !botSeat) break;
      this.seatSpectator(room, p);
      this.announce(room, `${p.name} took an open seat.`);
    }
  }

  private addBot(room: Room): RoomPlayer {
    const used = new Set(room.players.map((p) => p.name));
    const persona = BOT_PERSONAS.find((b) => !used.has(b.name)) ?? { name: `Bot ${room.players.length}`, avatar: '🤖' };
    const bot: RoomPlayer = {
      id: `bot_${randomUUID().slice(0, 8)}`,
      secret: null,
      name: persona.name,
      avatar: persona.avatar,
      color: this.nextColor(room),
      isBot: true,
      connected: true,
      spectator: false,
      team: room.meta.teams ? this.smallestTeam(room) : null,
      sockets: new Set(),
      joinedAt: Date.now(),
      watchByChoice: false,
    };
    room.players.push(bot);
    return bot;
  }

  // ---------- game loop ----------

  /** Call after any mutation: updates status, schedules bots, broadcasts personalised snapshots. */
  private changed(room: Room) {
    room.lastActive = Date.now();
    if (room.status === 'playing' && room.def.isFinished(room.state)) room.status = 'finished';
    this.scheduleBots(room);
    this.broadcast(room);
  }

  private tickAll() {
    for (const room of this.rooms.values()) {
      if (room.status !== 'playing' || !room.def.tick) continue;
      try {
        if (room.def.tick(room.state, this.ctx(room))) this.changed(room);
      } catch (err) {
        console.error(`tick ${room.code}`, err);
      }
    }
  }

  private scheduleBots(room: Room) {
    if (room.botTimer || room.status !== 'playing' || !room.def.bot) return;
    // Bots wait while every human is away, then pick up where they left off.
    if (!room.players.some((p) => !p.isBot && p.connected)) return;
    const bots = room.players.filter((p) => p.isBot && !p.spectator);
    const ready = bots.find((b) => room.def.bot!(room.state, b.id, this.ctx(room)));
    if (!ready) return;
    const base = room.def.botDelay?.(room.state) ?? 800;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (room.status !== 'playing' || !this.rooms.has(room.code)) return;
      const action = room.def.bot!(room.state, ready.id, this.ctx(room));
      if (action) this.applyAction(room, ready.id, action);
      else this.scheduleBots(room);
    }, base * (0.7 + Math.random() * 0.6));
  }

  private clearBotTimer(room: Room) {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = null;
  }

  private broadcast(room: Room) {
    const base = {
      code: room.code,
      gameId: room.gameId,
      status: room.status,
      hostId: room.hostId,
      players: room.players.map(publicInfo),
      config: room.config,
      chat: room.chat,
    };
    for (const p of room.players) {
      if (p.sockets.size === 0) continue;
      const snapshot: RoomSnapshot = {
        ...base,
        you: p.id,
        view: room.state ? room.def.view(room.state, p.id) : null,
        serverNow: Date.now(),
      };
      for (const sid of p.sockets) this.io.to(sid).emit('room:state', snapshot);
    }
  }

  // ---------- helpers ----------

  private ctx(room: Room): GameContext {
    return {
      now: Date.now(),
      random: Math.random,
      announce: (text) => this.announce(room, text),
      isConnected: (id) => !!room.players.find((p) => p.id === id && p.connected),
    };
  }

  /** Chat helpers only record; the caller's changed() broadcasts. */
  private announce(room: Room, text: string) {
    this.pushChat(room, { id: randomUUID(), playerId: null, text, ts: Date.now() });
  }

  private pushChat(room: Room, msg: ChatMessage) {
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.splice(0, room.chat.length - MAX_CHAT);
  }

  private inRoom(socket: Socket, fn: (room: Room, me: RoomPlayer) => string | void | object) {
    const room = socket.data.code ? this.rooms.get(socket.data.code) : undefined;
    const me = room && this.player(room, socket.data.playerId);
    if (!room || !me) return 'You are not in a room.';
    const result = fn(room, me);
    if (typeof result === 'string') return result;
    this.changed(room);
    return result ?? {};
  }

  private asHost(socket: Socket, fn: (room: Room, me: RoomPlayer) => string | void) {
    return this.inRoom(socket, (room, me) => (room.hostId === me.id ? fn(room, me) : 'Only the host can do that.'));
  }

  private player(room: Room, id: PlayerId | undefined) {
    return room.players.find((p) => p.id === id);
  }

  private activeCount(room: Room) {
    return room.players.filter((p) => !p.spectator).length;
  }

  private smallestTeam(room: Room): number {
    const n = room.meta.teams!.names.length;
    const counts = Array.from({ length: n }, (_, t) => room.players.filter((p) => !p.spectator && p.team === t).length);
    return counts.indexOf(Math.min(...counts));
  }

  private nextColor(room: Room) {
    const used = new Set(room.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
  }

  private uniqueName(room: Room, name: string, self?: RoomPlayer) {
    const taken = new Set(room.players.filter((p) => p !== self).map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  }

  private checkIdentity(identity: Identity): string | null {
    if (!identity?.id || !identity.secret || typeof identity.id !== 'string') return 'Missing identity.';
    if (identity.id.startsWith('bot_')) return 'Invalid identity.';
    if (!sanitizeName(identity.name)) return 'Pick a display name first.';
    return null;
  }

  private newCode(): string {
    for (;;) {
      const code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  private destroy(room: Room) {
    this.clearBotTimer(room);
    this.rooms.delete(room.code);
    console.log(`room ${room.code} closed`);
  }

  private sweep() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const empty = !room.players.some((p) => !p.isBot && p.connected);
      if (empty && now - room.lastActive > IDLE_ROOM_MS / 6) this.destroy(room);
      else if (now - room.lastActive > IDLE_ROOM_MS) this.destroy(room);
    }
  }

  get roomCount() {
    return this.rooms.size;
  }
}

function publicInfo(p: RoomPlayer): PlayerInfo {
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    isBot: p.isBot,
    connected: p.connected,
    spectator: p.spectator,
    team: p.team,
  };
}
