# Game Night

Browser games to play remotely with friends. There are no accounts: pick a game, open a lobby, share the invite link (`/join/CODE`), and play.

**Live games:** Don’t Say It! (a describe-the-word party game: co-op with 2–3 players, two teams with 4–16), Sketch It (a live drawing-and-guessing game for 2–12, everyone-for-themselves or teams with steals), Four in a Row (1v1 or solo against a bot, single game to best of 5) and Hearts (4 seats; bots fill the empty ones).
**On the roadmap (listed as "coming soon" in the catalog):** Spades, Code Words, On the Dial, Who's the Spy?, Werewolf, Liar's Dice, Euchre, Crazy Eights, Trivia Showdown, Word Grid, Dice Royale, Gin Rummy.

## Running it

```bash
npm install
npm run dev        # Vite on :5173 + game server on :3001 (proxied)
npm test           # game-logic tests (full bot games of Hearts, Don’t Say It! rules)
npm run build      # typecheck + build the client to dist/
npm start          # production: one Node process serves dist/ and the websocket
```

## How it fits together

```
shared/                 Runs on both client and server
  types.ts              Room snapshot, player, identity, ack types
  game.ts               GameDefinition: the contract every game implements
  catalog.ts            Every game's metadata: players, teams, bots, settings, rules, colours
  cards.ts              52-card deck helpers for any card game
  games/<id>/           Pure game logic + types (+ tests)
server/
  rooms.ts              RoomManager: lobbies, invite codes, seats, teams, host, chat,
                        reconnects, bots, timers, and per-player views
  registry.ts           Maps game ids to their GameDefinition
src/                    React client
  pages/                Home, game page, room (lobby + in-game layout)
  components/           Shared UI: invite card, chat, players, settings, name gate
  games/<id>/           Each game's board component
  games/registry.tsx    Maps game ids to their board
  styles/theme.css      Design tokens. Restyle the whole suite from here
```

- **Server-authoritative.** Clients send actions; the server validates them against the game, then sends each player their own `view(state, playerId)`, so hidden cards and secret words never reach the wrong player.
- **Identity.** The browser generates a random id plus a secret and stores them in `localStorage`. The secret lets a player reclaim their seat after a refresh or dropped connection. The only "sign-in" step is choosing a name and an avatar.
- **Lobby behaviour.** The host changes settings, adds bots, moves players between teams, and can remove players. If the host leaves, hosting passes to someone else. When people arrive after the game has started, they take over a bot's seat, join a team, or watch live as spectators. People who open the invite to a full lobby wait as spectators and get the next open seat; the host can also move players between seats and watchers (handy for winner-stays rotations).
- **Live streams.** Games that need high-frequency data (Sketch It's brush strokes) use `stream()` and `streamSync()`. Accepted data is relayed straight to the room without a full snapshot, and anyone who joins or reconnects catches up from `streamSync()`.
- **Bots and timers.** Games return bot moves from `bot()` and advance timers in `tick()`; the room manager schedules both. Bots pause while every human is disconnected.

## Adding a game

1. Add a catalog entry in `shared/catalog.ts` (or flip a `soon` entry to `live`). This sets the player counts, teams, bots, settings, and how-to-play text.
2. Write the logic in `shared/games/<id>/logic.ts` by implementing `GameDefinition`: `setup`, `action`, `view`, `isFinished`, plus `tick`, `bot`, `swapPlayer`, and `addPlayer` as needed. Keep it pure: take time and randomness from `ctx`.
3. Register it in `server/registry.ts`.
4. Build `src/games/<id>/<Name>Board.tsx` (it receives `view`, `act`, `playersById`, and `serverNow`) and register it in `src/games/registry.tsx`.

Lobbies, invites, chat, reconnects, the host controls, and the in-game sidebar all work without further changes.

## Deploying (Render)

`render.yaml` is a Render Blueprint. In Render choose **New → Blueprint**, pick this repo, and apply. Render then:

- builds with `npm ci --include=dev && npm run build` (the dev dependencies are needed for TypeScript and Vite)
- starts with `npm start`, a single Node process that serves `dist/` and the websocket on Render's `PORT`
- health-checks `/api/health` and redeploys on every push to `main`

The blueprint uses the **free** plan. Free services sleep after about 15 idle minutes and take roughly a minute to wake, and rooms open at that point are lost. Change `plan: free` to `plan: starter` to keep it always on.

Rooms live in memory, so redeploying or restarting the server ends every game in progress. Keep `numInstances: 1`; running more than one instance needs Redis plus the Socket.IO Redis adapter.
