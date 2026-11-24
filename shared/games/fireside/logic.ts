import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId, PlayerInfo } from '../../types';
import { DECKS, MIXES, SPICE, type Card } from './cards';
import type { FiresideAction, FiresideAward, FiresideView, Pick } from './types';

/** [deck index, card index] */
type CardRef = [number, number];

interface FiresideState {
  phase: 'cards' | 'over';
  order: PlayerId[];
  mix: string;
  spice: number;
  /** Cards still to deal; the next one is at the end. */
  pile: CardRef[];
  card: CardRef;
  cardNo: number;
  totalCards: number;
  seq: number;
  holderId: PlayerId;
  picks: Record<PlayerId, Pick>;
  revealed: boolean;
  endVotes: PlayerId[];
  /** A majority of the players who are here; kept fresh by tick() as people come and go. */
  endVotesNeeded: number;

  // Running tallies for the closing awards.
  cardsPlayed: number;
  splits: number;
  unanimous: number;
  /** Per pair of players: cards both voted on, and how many they agreed on. */
  pairs: Record<string, { a: PlayerId; b: PlayerId; both: number; same: number }>;
  outvoted: Record<PlayerId, number>;
  named: Record<PlayerId, number>;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a pile that rotates through the chosen decks, with After Dark cards sprinkled in at the chosen rate. */
function buildPile(mix: string, spice: number, random: () => number): CardRef[] {
  const ids = MIXES[mix] ?? MIXES.everything;
  const refs = (deck: number) => shuffle(DECKS[deck].cards.map((_, i): CardRef => [deck, i]), random);
  const stacks = shuffle(DECKS.map((d, i) => (ids.includes(d.id) ? i : -1)).filter((i) => i >= 0), random).map(refs);
  const spicy = DECKS.flatMap((d, i) => (d.spicy ? refs(i) : []));

  const main: CardRef[] = [];
  while (stacks.some((s) => s.length)) for (const s of stacks) if (s.length) main.push(s.pop()!);

  const pile: CardRef[] = [];
  while (main.length) {
    // Let the first couple of cards warm the room up before anything spicy lands.
    if (pile.length >= 2 && spicy.length && random() < spice) pile.push(spicy.pop()!);
    else pile.push(main.shift()!);
  }
  return pile.reverse();
}

const cardOf = (state: FiresideState): Card => DECKS[state.card[0]].cards[state.card[1]];

function deal(state: FiresideState, ctx: GameContext) {
  if (state.pile.length === 0) state.pile = buildPile(state.mix, state.spice, ctx.random);
  state.card = state.pile.pop()!;
  state.seq++;
  state.picks = {};
  state.revealed = false;
}

/** The next person round the fire who is actually here. */
function nextHolder(state: FiresideState, ctx: GameContext): PlayerId {
  const at = state.order.indexOf(state.holderId);
  for (let step = 1; step <= state.order.length; step++) {
    const id = state.order[(at + step) % state.order.length];
    if (ctx.isConnected(id)) return id;
  }
  return state.order[(at + 1) % state.order.length];
}

const majority = (state: FiresideState, ctx: GameContext) =>
  Math.floor(state.order.filter((id) => ctx.isConnected(id)).length / 2) + 1;

/** Everyone who is here has picked. */
function allIn(state: FiresideState, ctx: GameContext) {
  const here = state.order.filter((id) => ctx.isConnected(id));
  return Object.keys(state.picks).length > 0 && here.every((id) => state.picks[id] !== undefined);
}

function reveal(state: FiresideState) {
  state.revealed = true;
  const voters = Object.keys(state.picks);
  const counts = new Map<Pick, number>();
  for (const id of voters) counts.set(state.picks[id], (counts.get(state.picks[id]) ?? 0) + 1);
  const top = Math.max(...counts.values());

  state.cardsPlayed++;
  if (voters.length >= 2) {
    if (counts.size === 1) state.unanimous++;
    else state.splits++;
  }
  // Being outvoted needs a crowd to be outvoted by.
  if (voters.length >= 3) {
    for (const id of voters) if (counts.get(state.picks[id])! < top) state.outvoted[id] = (state.outvoted[id] ?? 0) + 1;
  }
  if (cardOf(state).kind === 'who') {
    for (const id of voters) state.named[state.picks[id]] = (state.named[state.picks[id]] ?? 0) + 1;
  }
  for (let i = 0; i < voters.length; i++) {
    for (let j = i + 1; j < voters.length; j++) {
      const [a, b] = [voters[i], voters[j]].sort();
      const pair = (state.pairs[`${a} ${b}`] ??= { a, b, both: 0, same: 0 });
      pair.both++;
      if (state.picks[a] === state.picks[b]) pair.same++;
    }
  }
}

function finish(state: FiresideState, ctx: GameContext) {
  state.phase = 'over';
  state.endVotes = [];
  ctx.announce('The fire’s burned down. Good night. 🔥');
}

function awards(state: FiresideState): FiresideAward[] {
  const out: FiresideAward[] = [];
  const seated = (id: PlayerId) => state.order.includes(id);

  // Kindred spirits: the pair who agreed most often, given enough cards to mean something.
  const pairs = Object.values(state.pairs).filter((p) => p.both >= 3 && p.same > 0 && seated(p.a) && seated(p.b));
  pairs.sort((x, y) => y.same / y.both - x.same / x.both || y.both - x.both);
  if (state.order.length >= 3 && pairs[0]) out.push({ id: 'kindred', players: [pairs[0].a, pairs[0].b], count: pairs[0].same, of: pairs[0].both });

  const most = (tally: Record<PlayerId, number>): [PlayerId[], number] => {
    const ids = Object.keys(tally).filter(seated);
    const top = Math.max(0, ...ids.map((id) => tally[id]));
    return [ids.filter((id) => tally[id] === top), top];
  };
  const [wolves, times] = most(state.outvoted);
  if (times >= 2 && wolves.length <= 2) out.push({ id: 'wolf', players: wolves, count: times });
  const [names, votes] = most(state.named);
  if (votes >= 2 && names.length <= 2) out.push({ id: 'named', players: names, count: votes });
  return out;
}

export const fireside: GameDefinition<FiresideState, FiresideAction, FiresideView> = {
  id: 'fireside',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length < 2 ? 'You need at least 2 players.' : null;
  },

  setup(players: PlayerInfo[], config, ctx) {
    const order = shuffle(players.filter((p) => !p.spectator).map((p) => p.id), ctx.random);
    const mix = String(config.mix ?? 'everything');
    const spice = SPICE[String(config.afterDark ?? 'off')] ?? 0;
    const state: FiresideState = {
      phase: 'cards',
      order,
      mix,
      spice,
      pile: buildPile(mix, spice, ctx.random),
      card: [0, 0],
      cardNo: 1,
      totalCards: Number(config.cards ?? 15),
      seq: 0,
      holderId: order[0],
      picks: {},
      revealed: false,
      endVotes: [],
      endVotesNeeded: 0,
      cardsPlayed: 0,
      splits: 0,
      unanimous: 0,
      pairs: {},
      outvoted: {},
      named: {},
    };
    state.endVotesNeeded = majority(state, ctx);
    deal(state, ctx);
    return state;
  },

  action(state, playerId, action, ctx) {
    if (!state.order.includes(playerId)) return 'Only players can do that.';
    if (state.phase !== 'cards') return 'The fire has burned down.';
    const card = cardOf(state);
    const voting = card.kind !== 'open';
    // If whoever holds the card has wandered off, anyone can keep things moving.
    const holds = playerId === state.holderId || !ctx.isConnected(state.holderId);

    switch (action.type) {
      case 'vote': {
        if (action.seq !== state.seq) return;
        if (!voting) return 'This one is answered out loud.';
        if (state.revealed) return 'The picks are already on the table.';
        const ok =
          card.kind === 'choice'
            ? Number.isInteger(action.pick) && (action.pick as number) >= 0 && (action.pick as number) < card.options.length
            : typeof action.pick === 'string' && state.order.includes(action.pick);
        if (!ok) return 'Pick one of the options.';
        state.picks[playerId] = action.pick;
        if (allIn(state, ctx)) reveal(state);
        return;
      }
      case 'reveal':
        if (!holds) return 'Only whoever holds the card can call the reveal.';
        if (action.seq !== state.seq || !voting || state.revealed) return;
        if (Object.keys(state.picks).length === 0) return 'Nobody has picked yet.';
        reveal(state);
        return;
      case 'pass':
        if (!holds) return 'Only whoever holds the card can swap it.';
        if (action.seq !== state.seq) return;
        if (state.revealed) return 'Too late to swap: the picks are on the table.';
        deal(state, ctx);
        return;
      case 'next':
        if (!holds) return 'Only whoever holds the card can move on.';
        if (action.seq !== state.seq) return;
        if (voting && !state.revealed) return 'Reveal the picks first, or swap the card.';
        if (!voting) state.cardsPlayed++;
        if (state.cardNo >= state.totalCards) return finish(state, ctx);
        state.holderId = nextHolder(state, ctx);
        state.cardNo++;
        deal(state, ctx);
        return;
      case 'end':
        if (state.endVotes.includes(playerId)) state.endVotes = state.endVotes.filter((id) => id !== playerId);
        else state.endVotes.push(playerId);
        state.endVotesNeeded = majority(state, ctx);
        if (state.endVotes.length >= state.endVotesNeeded) finish(state, ctx);
        return;
      default:
        return 'Unknown action.';
    }
  },

  tick(state, ctx) {
    if (state.phase !== 'cards') return false;
    let changed = false;
    const needed = majority(state, ctx);
    if (needed !== state.endVotesNeeded) {
      state.endVotesNeeded = needed;
      changed = true;
    }
    // Someone leaving can be what completes the vote.
    if (!state.revealed && cardOf(state).kind !== 'open' && allIn(state, ctx)) {
      reveal(state);
      changed = true;
    }
    return changed;
  },

  addPlayer(state, player) {
    if (state.phase !== 'cards') return false;
    state.order.push(player.id);
    return { team: null };
  },

  view(state, viewerId) {
    const deck = DECKS[state.card[0]];
    const card = cardOf(state);
    const over = state.phase === 'over';
    return {
      phase: state.phase,
      order: state.order,
      role: state.order.includes(viewerId) ? 'player' : 'spectator',
      cardNo: state.cardNo,
      totalCards: state.totalCards,
      seq: state.seq,
      card: over
        ? null
        : { kind: card.kind, text: card.text, options: card.kind === 'choice' ? card.options : [], deck: deck.title, emoji: deck.emoji, spicy: !!deck.spicy },
      holderId: state.holderId,
      voted: Object.keys(state.picks),
      myPick: state.picks[viewerId] ?? null,
      revealed: state.revealed,
      picks: state.revealed && !over ? state.picks : null,
      endVotes: state.endVotes,
      endVotesNeeded: state.endVotesNeeded,
      cardsPlayed: state.cardsPlayed,
      splits: state.splits,
      unanimous: state.unanimous,
      awards: over ? awards(state) : [],
    };
  },

  isFinished: (state) => state.phase === 'over',
};
