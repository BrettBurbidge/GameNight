import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { findForbiddenHit, isCorrectGuess, dontSayIt } from './logic';

test('guess matching is forgiving', () => {
  assert.ok(isCorrectGuess('pizza', 'Pizza'));
  assert.ok(isCorrectGuess('is it a PIZZA?', 'Pizza'));
  assert.ok(isCorrectGuess('pizzas', 'Pizza'));
  assert.ok(isCorrectGuess('hotdog', 'Hot dog'));
  assert.ok(isCorrectGuess('wifi', 'Wi-Fi'));
  assert.ok(!isCorrectGuess('pizzeria', 'Pizza'));
  assert.ok(!isCorrectGuess('cheese', 'Pizza'));
});

test('typed clues using forbidden words are caught', () => {
  const t = ['Cheese', 'Slice', 'Italian', 'Pepperoni', 'Delivery'];
  assert.equal(findForbiddenHit('round thing with cheesy toppings', 'Pizza', t), 'Cheese');
  assert.equal(findForbiddenHit('you slice it', 'Pizza', t), 'Slice');
  assert.equal(findForbiddenHit('two large pizzas please', 'Pizza', t), 'Pizza');
  assert.equal(findForbiddenHit('round flat dinner with tomato sauce', 'Pizza', t), null);
  assert.equal(findForbiddenHit('it happens in rush hour', 'Traffic', ['Rush hour']), 'Rush hour');
});

test('a turn scores and rotates to the other team', () => {
  let now = 1000;
  const ctx = (): GameContext => ({ now, random: () => 0.3, announce: () => {} });
  const players: PlayerInfo[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: i % 2,
  }));
  const state = dontSayIt.setup(players, { turnSeconds: 60, rounds: 1, skipPenalty: 1 }, ctx());
  const team = state.activeTeam;
  const giver = state.giverId;
  const guesser = state.teams[team].find((id) => id !== giver)!;
  const opponent = state.teams[1 - team][0];
  assert.ok(dontSayIt.action(state, guesser, { type: 'start-turn' }, ctx()));
  dontSayIt.action(state, giver, { type: 'start-turn' }, ctx());
  assert.equal(dontSayIt.view(state, guesser).card, null, 'guessers never see the card');
  const word = dontSayIt.view(state, giver).card!.word;
  dontSayIt.action(state, guesser, { type: 'guess', text: word }, ctx());
  assert.equal(state.scores[team], 1);
  dontSayIt.action(state, opponent, { type: 'buzz' }, ctx());
  assert.equal(state.scores[team], 0);
  now += 61_000;
  assert.ok(dontSayIt.tick!(state, ctx()));
  assert.equal(state.phase, 'ready');
  assert.equal(state.activeTeam, 1 - team);
});

test('two players play co-op, alternating clue giver, and latecomers join the same team', () => {
  let now = 1000;
  const ctx = (): GameContext => ({ now, random: () => 0.7, announce: () => {} });
  const players: PlayerInfo[] = ['a', 'b'].map((id, i) => ({
    id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: i,
  }));
  assert.equal(dontSayIt.validateStart!(players.slice(0, 1), {}), 'You need at least 2 players.');
  assert.equal(dontSayIt.validateStart!(players, {}), null);
  const state = dontSayIt.setup(players, { turnSeconds: 30, rounds: 1, skipPenalty: 1 }, ctx());
  assert.equal(state.mode, 'coop');
  assert.deepEqual([...state.teams[0]].sort(), ['a', 'b']);
  assert.equal(state.activeTeam, 0);
  const first = state.giverId;
  const other = first === 'a' ? 'b' : 'a';
  assert.equal(dontSayIt.view(state, other).role, 'guesser');

  dontSayIt.action(state, first, { type: 'start-turn' }, ctx());
  const word = dontSayIt.view(state, first).card!.word;
  dontSayIt.action(state, other, { type: 'guess', text: word }, ctx());
  assert.equal(state.scores[0], 1);
  assert.ok(dontSayIt.action(state, other, { type: 'buzz' }, ctx()), 'nobody can buzz in co-op');

  now += 31_000;
  dontSayIt.tick!(state, ctx());
  assert.equal(state.activeTeam, 0);
  assert.equal(state.giverId, other, 'the clue giver alternates');

  const late: PlayerInfo = { ...players[0], id: 'c', name: 'c' };
  assert.deepEqual(dontSayIt.addPlayer!(state, late, ctx()), { team: 0 });
  dontSayIt.action(state, other, { type: 'start-turn' }, ctx());
  now += 31_000;
  dontSayIt.tick!(state, ctx());
  assert.equal(state.phase, 'over');
  assert.equal(dontSayIt.view(state, 'a').winner, null);
});
