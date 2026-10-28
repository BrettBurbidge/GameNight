import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { hearts } from './logic';

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const players: PlayerInfo[] = ['a', 'b', 'c', 'd'].map((id) => ({
  id, name: id, avatar: '', color: '', isBot: true, connected: true, spectator: false, team: null,
}));

test('four bots play a full game of Hearts to completion', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    let now = 0;
    const ctx = (): GameContext => ({ now, random: seededRandom(seed + now), announce: () => {}, isConnected: () => true });
    const state = hearts.setup(players, { targetScore: 100 }, ctx());
    let steps = 0;
    while (!hearts.isFinished(state) && steps++ < 20000) {
      now += 2000;
      if (hearts.tick!(state, ctx())) continue;
      const mover = players.find((p) => hearts.bot!(state, p.id, ctx()));
      assert.ok(mover, `someone should be able to move (phase ${state.phase})`);
      const err = hearts.action(state, mover.id, hearts.bot!(state, mover.id, ctx())!, ctx());
      assert.equal(err, undefined);
      if (state.phase === 'playing') {
        const total = Object.values(state.hands).reduce((n, h) => n + h.length, 0) + state.trick.length;
        assert.equal(total, 52 - state.tricksPlayed * 4);
      }
    }
    assert.ok(hearts.isFinished(state));
    for (const hand of state.history) {
      const sum = Object.values(hand).reduce((a, b) => a + b, 0);
      assert.ok(sum === 26 || sum === 78, `hand points should total 26 (or 78 on a moon), got ${sum}`);
    }
  }
});

test('first lead must be the two of clubs and hearts cannot be led early', () => {
  let now = 0;
  const ctx = (): GameContext => ({ now, random: seededRandom(7), announce: () => {}, isConnected: () => true });
  const state = hearts.setup(players, {}, ctx());
  for (const p of players) hearts.action(state, p.id, hearts.bot!(state, p.id, ctx())!, ctx());
  assert.equal(state.phase, 'playing');
  const leader = state.turn!;
  assert.deepEqual(hearts.view(state, leader).legal, ['2C']);
  const other = state.hands[leader].find((c) => c !== '2C')!;
  assert.ok(hearts.action(state, leader, { type: 'play', card: other }, ctx()));
});
