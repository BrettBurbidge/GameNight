import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../../catalog';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { DECKS, MIXES, SPICE } from './cards';
import { fireside } from './logic';

const seat = (ids: string[]): PlayerInfo[] =>
  ids.map((id) => ({ id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: null }));

/** A small seeded generator, so shuffles vary but tests stay repeatable. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function table(ids: string[], config: Record<string, string | number> = {}, seed = 7) {
  const away = new Set<string>();
  const said: string[] = [];
  const random = seeded(seed);
  const ctx = (): GameContext => ({ now: 1000, random, announce: (t) => said.push(t), isConnected: (id) => !away.has(id) });
  const state = fireside.setup(seat(ids), { afterDark: 'off', ...config }, ctx());
  type Move = { type: 'reveal' | 'pass' | 'next' | 'end' } | { type: 'vote'; pick: number | string };
  /** Sends a move the way the board does: stamped with the card the player is looking at. */
  const act = (id: string, move: Move) => fireside.action(state, id, { seq: state.seq, ...move } as never, ctx());
  const view = (id = ids[0]) => fireside.view(state, id);
  /** Swaps cards until the open one is of the wanted kind. */
  const until = (kind: string) => {
    for (let i = 0; i < 400 && view().card!.kind !== kind; i++) act(state.holderId, { type: 'pass' });
    assert.equal(view().card!.kind, kind);
  };
  return { state, away, said, ctx, act, view, until };
}

test('the decks are well formed', () => {
  const seen = new Set<string>();
  for (const deck of DECKS) {
    assert.ok(deck.cards.length >= 24, `${deck.title} has enough cards`);
    for (const card of deck.cards) {
      assert.ok(!seen.has(card.text), `duplicate card: ${card.text}`);
      seen.add(card.text);
      if (card.kind !== 'choice') continue;
      assert.ok(card.options.length >= 2 && card.options.length <= 4, `2 to 4 options: ${card.text}`);
      assert.equal(new Set(card.options).size, card.options.length, `distinct options: ${card.text}`);
    }
  }
  const ids = DECKS.map((d) => d.id);
  for (const [mix, decks] of Object.entries(MIXES)) {
    assert.ok(decks.length >= 3, `${mix} has a few decks`);
    for (const id of decks) {
      assert.ok(ids.includes(id), `${mix} names a real deck: ${id}`);
      assert.ok(!DECKS.find((d) => d.id === id)!.spicy, `${mix} leaves After Dark to its own setting`);
    }
  }
});

test('the lobby settings match what the game understands', () => {
  const meta = GAMES.find((g) => g.id === 'fireside')!;
  const values = (key: string) => meta.config!.find((c) => c.key === key)!.options.map((o) => String(o.value));
  assert.deepEqual(values('mix').sort(), Object.keys(MIXES).sort());
  assert.deepEqual(values('afterDark').sort(), Object.keys(SPICE).sort());
});

test('picks stay secret until everyone is in', () => {
  const { act, view, until } = table(['a', 'b', 'c']);
  until('choice');
  assert.equal(act('a', { type: 'vote', pick: 0 }), undefined);
  assert.equal(act('b', { type: 'vote', pick: 1 }), undefined);

  const waiting = view('c');
  assert.deepEqual(waiting.voted.sort(), ['a', 'b']);
  assert.equal(waiting.picks, null, 'nobody sees the picks yet');
  assert.equal(waiting.myPick, null);
  assert.equal(view('a').myPick, 0, 'you can see your own');
  assert.equal(view('ghost').picks, null);

  assert.equal(act('a', { type: 'vote', pick: 1 }), undefined, 'you can change your mind before the reveal');
  assert.ok(act('a', { type: 'vote', pick: 9 }), 'only real options count');
  assert.ok(act('ghost', { type: 'vote', pick: 0 }), 'spectators cannot vote');

  assert.equal(act('c', { type: 'vote', pick: 0 }), undefined);
  const shown = view('ghost');
  assert.equal(shown.revealed, true, 'the last pick reveals the table');
  assert.deepEqual(shown.picks, { a: 1, b: 1, c: 0 });
  assert.ok(act('c', { type: 'vote', pick: 1 }), 'no changing after the reveal');
});

test('who cards name a player', () => {
  const { act, view, until } = table(['a', 'b', 'c']);
  until('who');
  assert.ok(act('a', { type: 'vote', pick: 0 }), 'a who card needs a player');
  assert.ok(act('a', { type: 'vote', pick: 'ghost' }), 'who has to be at the table');
  act('a', { type: 'vote', pick: 'b' });
  act('b', { type: 'vote', pick: 'b' });
  act('c', { type: 'vote', pick: 'a' });
  assert.deepEqual(view().picks, { a: 'b', b: 'b', c: 'a' });
});

test('holding the card: swapping, calling the reveal and moving on', () => {
  const { state, act, view, until } = table(['a', 'b', 'c'], { cards: 3 });
  const holder = state.holderId;
  const [x, y] = state.order.filter((id) => id !== holder);

  until('choice');
  const seq = state.seq;
  assert.ok(act(x, { type: 'pass' }), 'only the holder swaps the card');
  assert.ok(act(holder, { type: 'next' }), 'a vote has to be revealed before moving on');
  assert.ok(act(holder, { type: 'reveal' }), 'there is nothing to reveal yet');
  act(x, { type: 'vote', pick: 0 });
  assert.ok(act(x, { type: 'reveal' }), 'only the holder calls the reveal');
  assert.equal(act(holder, { type: 'reveal' }), undefined);
  assert.deepEqual(view().picks, { [x]: 0 });
  assert.ok(act(holder, { type: 'pass' }), 'no swapping once it is revealed');
  assert.equal(state.seq, seq);

  assert.equal(fireside.action(state, holder, { type: 'next', seq: seq - 1 }, table(['a', 'b']).ctx()), undefined);
  assert.equal(state.cardNo, 1, 'a click meant for an earlier card is dropped');

  assert.equal(act(holder, { type: 'next' }), undefined);
  assert.equal(state.cardNo, 2);
  assert.notEqual(state.holderId, holder, 'the card passes round the fire');
  assert.equal(view(y).voted.length, 0);
  assert.equal(view(y).revealed, false);

  until('open');
  assert.ok(act(state.holderId, { type: 'vote', pick: 0 }), 'open cards are answered out loud');
  act(state.holderId, { type: 'next' });
  until('open');
  act(state.holderId, { type: 'next' });
  assert.equal(view().phase, 'over', 'the game ends after the last card');
  assert.equal(view().card, null);
  assert.ok(fireside.isFinished(state));
});

test('people leaving do not stall the table', () => {
  const { state, away, act, view, until, ctx } = table(['a', 'b', 'c']);
  until('choice');
  const holder = state.holderId;
  const [x, y] = state.order.filter((id) => id !== holder);
  act(holder, { type: 'vote', pick: 0 });
  act(x, { type: 'vote', pick: 1 });
  assert.equal(fireside.tick!(state, ctx()), false);

  away.add(y);
  assert.equal(fireside.tick!(state, ctx()), true, 'the vote completes without the person who left');
  assert.equal(view().revealed, true);

  away.add(holder);
  assert.equal(act(x, { type: 'next' }), undefined, 'anyone can move on while the holder is away');
  assert.equal(state.holderId, x, 'and the card skips empty chairs');
});

test('a majority can call it a night', () => {
  const { act, view, said } = table(['a', 'b', 'c']);
  assert.equal(view().endVotesNeeded, 2);
  act('a', { type: 'end' });
  act('a', { type: 'end' });
  assert.deepEqual(view().endVotes, [], 'voting twice takes it back');
  act('a', { type: 'end' });
  act('b', { type: 'end' });
  assert.equal(view().phase, 'over');
  assert.equal(said.length, 1);
  assert.ok(act('c', { type: 'end' }), 'nothing more happens after the end');
});

test('latecomers pull up a chair', () => {
  const { state, act, view, until, ctx } = table(['a', 'b']);
  until('choice');
  assert.deepEqual(fireside.addPlayer!(state, seat(['d'])[0], ctx()), { team: null });
  act('a', { type: 'vote', pick: 0 });
  act('b', { type: 'vote', pick: 0 });
  assert.equal(view().revealed, false, 'the newcomer gets a say too');
  act('d', { type: 'vote', pick: 1 });
  assert.equal(view().revealed, true);
});

test('the closing awards', () => {
  const { state, act, view, until } = table(['a', 'b', 'c', 'd'], { cards: 30 });
  // a and b always agree, d is always on their own.
  for (let i = 0; i < 4; i++) {
    until('choice');
    act('a', { type: 'vote', pick: 0 });
    act('b', { type: 'vote', pick: 0 });
    act('c', { type: 'vote', pick: i % 2 });
    act('d', { type: 'vote', pick: 1 });
    act(state.holderId, { type: 'next' });
  }
  for (let i = 0; i < 2; i++) {
    until('who');
    for (const id of ['a', 'b', 'c', 'd']) act(id, { type: 'vote', pick: 'c' });
    act(state.holderId, { type: 'next' });
  }
  for (const id of ['a', 'b', 'c']) act(id, { type: 'end' });

  const end = view();
  assert.equal(end.phase, 'over');
  assert.equal(end.cardsPlayed, 6);
  assert.equal(end.splits, 4);
  assert.equal(end.unanimous, 2);
  const award = (id: string) => end.awards.find((a) => a.id === id)!;
  assert.deepEqual(award('kindred').players, ['a', 'b']);
  assert.equal(award('kindred').count, 6);
  assert.equal(award('kindred').of, 6);
  assert.deepEqual(award('wolf').players, ['d']);
  assert.deepEqual(award('named'), { id: 'named', players: ['c'], count: 8 });
});

test('After Dark cards only turn up when asked for', () => {
  const dealt = (afterDark: string, mix = 'everything') => {
    const { state, act, view } = table(['a', 'b'], { afterDark, mix }, 11);
    const decks: { deck: string; spicy: boolean }[] = [];
    for (let i = 0; i < 120; i++) {
      const card = view().card!;
      decks.push({ deck: card.deck, spicy: card.spicy });
      act(state.holderId, { type: 'pass' });
    }
    return decks;
  };
  const spicy = (cards: { spicy: boolean }[]) => cards.filter((c) => c.spicy).length;

  assert.equal(spicy(dealt('off')), 0);
  const few = spicy(dealt('few'));
  const lots = spicy(dealt('lots'));
  assert.ok(few > 0 && few < lots, `a few (${few}) is fewer than lots (${lots})`);
  assert.equal(spicy(dealt('lots').slice(0, 2)), 0, 'the first cards are always tame');

  const titles = MIXES.dilemmas.map((id) => DECKS.find((d) => d.id === id)!.title);
  for (const card of dealt('off', 'dilemmas')) assert.ok(titles.includes(card.deck), `${card.deck} is not a dilemma deck`);
  assert.equal(new Set(dealt('off', 'dilemmas').slice(0, 3).map((c) => c.deck)).size, 3, 'the decks take turns');
});
