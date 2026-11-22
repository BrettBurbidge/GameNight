import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { onTheDial } from './logic';
import { signalBars } from './scoring';

const seat = (ids: string[]): PlayerInfo[] =>
  ids.map((id) => ({ id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: null }));

function table(ids: string[], config: Record<string, string | number>) {
  const clock = { now: 1000 };
  const away = new Set<string>();
  const said: string[] = [];
  const ctx = (): GameContext => ({ now: clock.now, random: () => 0.5, announce: (t) => said.push(t), isConnected: (id) => !away.has(id) });
  const state = onTheDial.setup(seat(ids), config, ctx());
  const act = (id: string, action: Parameters<typeof onTheDial.action>[2]) => onTheDial.action(state, id, action, ctx());
  return { state, clock, away, said, ctx, act };
}

test('signal fades with distance from the target', () => {
  assert.deepEqual([0, 2, 3, 5, 6, 9, 10, 14, 15, 20, 21].map((off) => signalBars(50 + off, 50)), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0]);
  assert.equal(signalBars(40, 50), signalBars(60, 50), 'either side counts the same');
});

test('a versus round: clue, private tuning, reveal and scoring', () => {
  const { state, clock, ctx, act } = table(['a', 'b', 'c'], { mode: 'versus', turnsEach: 1, clueSeconds: 75, tuneSeconds: 45 });
  assert.equal(state.mode, 'versus');
  const dj = state.broadcasterId;
  const [t1, t2] = state.order.filter((id) => id !== dj);
  const target = state.target;

  assert.equal(onTheDial.view(state, dj).target, target, 'the broadcaster sees the signal');
  assert.equal(onTheDial.view(state, t1).target, null, 'tuners do not');
  assert.equal(onTheDial.view(state, 'watcher').target, null, 'spectators do not either');
  assert.ok(onTheDial.filterChat!(state, dj, 'hi'), 'the broadcaster cannot chat mid-round');
  assert.equal(onTheDial.filterChat!(state, t1, 'hi'), null);

  assert.ok(act(t1, { type: 'clue', text: 'a hint' }), 'only the broadcaster gives the clue');
  assert.ok(act(t1, { type: 'tune', value: 50 }), 'the dial is closed until the clue is out');
  assert.ok(act(dj, { type: 'clue', text: 'about 70' }), 'numbers are rejected');
  assert.equal(act(dj, { type: 'clue', text: '  a   warm bath ' }), undefined);
  assert.equal(state.clue, 'a warm bath');
  assert.equal(state.phase, 'tune');

  assert.ok(act(dj, { type: 'tune', value: 50 }), 'the broadcaster cannot tune');
  act(t1, { type: 'tune', value: target + 4, lock: true });
  assert.ok(act(t1, { type: 'tune', value: target }), 'locked needles stay put');
  assert.deepEqual(onTheDial.view(state, t2).locked, [t1], 'others see who locked in');
  assert.equal(onTheDial.view(state, t2).result, null, 'but not where');
  assert.equal(onTheDial.view(state, t2).myNeedle, null);

  // t2 nudges without locking; the timer running out still counts where the needle sits.
  act(t2, { type: 'tune', value: target - 30 });
  assert.equal(state.phase, 'tune');
  clock.now += 46_000;
  assert.ok(onTheDial.tick!(state, ctx()));
  assert.equal(state.phase, 'reveal');
  const result = onTheDial.view(state, t2).result!;
  assert.equal(result.target, target);
  assert.deepEqual(result.bars, { [t1]: 4, [t2]: 0 });
  assert.equal(result.broadcasterBars, 2, 'the broadcaster earns the tuners’ average');
  assert.deepEqual(state.scores, { [dj]: 2, [t1]: 4, [t2]: 0 });

  assert.ok(act('watcher', { type: 'next' }), 'spectators cannot skip the reveal');
  act(t2, { type: 'next' });
  assert.equal(state.phase, 'clue');
  assert.notEqual(state.broadcasterId, dj, 'the broadcast passes on');
  assert.equal(onTheDial.view(state, dj).totalRounds, 3);
});

test('the round reveals as soon as every tuner who is here locks in', () => {
  const { state, away, ctx, act } = table(['a', 'b', 'c', 'd'], { turnsEach: 1 });
  const dj = state.broadcasterId;
  const [t1, t2, t3] = state.order.filter((id) => id !== dj);
  act(dj, { type: 'clue', text: 'lukewarm tea' });
  act(t1, { type: 'tune', value: 10, lock: true });
  act(t2, { type: 'tune', value: 20, lock: true });
  assert.equal(state.phase, 'tune');
  away.add(t3);
  assert.ok(onTheDial.tick!(state, ctx()), 'a tuner who dropped does not hold everyone up');
  assert.equal(state.phase, 'reveal');
  assert.equal(state.result!.needles[t3], undefined);
});

test('a broadcaster who never gives a clue is skipped, and the swap works once', () => {
  const { state, clock, said, ctx, act } = table(['a', 'b', 'c'], { turnsEach: 1, clueSeconds: 45 });
  const dj = state.broadcasterId;
  const band = state.bandIndex;
  assert.ok(onTheDial.view(state, dj).canSwap);
  assert.equal(act(dj, { type: 'swap' }), undefined);
  assert.notEqual(state.bandIndex, band);
  assert.ok(act(dj, { type: 'swap' }), 'only one swap per round');
  clock.now += 46_000;
  assert.ok(onTheDial.tick!(state, ctx()));
  assert.equal(state.phase, 'clue');
  assert.notEqual(state.broadcasterId, dj);
  assert.equal(state.round, 1);
  assert.equal(said.length, 1);
});

test('two players play co-op to the end; latecomers join the current lap', () => {
  const { state, clock, said, ctx, act } = table(['a', 'b'], { mode: 'versus', turnsEach: 1 });
  assert.equal(onTheDial.validateStart!(seat(['a']), {}), 'You need at least 2 players.');
  assert.equal(state.mode, 'coop', 'versus needs three');

  const first = state.broadcasterId;
  const other = state.order.find((id) => id !== first)!;
  act(first, { type: 'clue', text: 'a campfire' });
  act(other, { type: 'tune', value: state.target, lock: true });
  assert.equal(state.phase, 'reveal', 'the only tuner locking in ends the round');
  assert.equal(state.teamScore, 5);

  assert.deepEqual(onTheDial.addPlayer!(state, seat(['c'])[0], ctx()), { team: null });
  assert.equal(onTheDial.view(state, 'c').role, 'tuner');
  clock.now += 16_000;
  onTheDial.tick!(state, ctx());
  assert.equal(state.broadcasterId, other, 'the reveal times out into the next round');

  act(other, { type: 'clue', text: 'an ice bath' });
  act(first, { type: 'tune', value: state.target + 50, lock: true });
  act('c', { type: 'tune', value: state.target + 50, lock: true });
  act(first, { type: 'next' });
  assert.equal(state.broadcasterId, 'c', 'the latecomer still gets a turn');
  act('c', { type: 'clue', text: 'a sauna' });
  act(first, { type: 'tune', value: state.target, lock: true });
  act(other, { type: 'tune', value: state.target + 4, lock: true });
  act(other, { type: 'next' });

  assert.ok(onTheDial.isFinished(state));
  assert.equal(state.teamScore, 10, '5 + 0 + round(4.5)');
  assert.deepEqual(onTheDial.view(state, first).winners, [], 'no winners in co-op');
  assert.equal(onTheDial.addPlayer!(state, seat(['d'])[0], ctx()), false);
  assert.match(said.at(-1)!, /10 of 15 bars/);
});
