import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { isClose, isCorrect, mentionsWord, sketch, STEAL_POINTS } from './logic';

function harness(ids: string[], config: Record<string, string | number> = {}, teamOf?: (i: number) => number) {
  const clock = { now: 1_000_000 };
  const away = new Set<string>();
  let seed = 7;
  const ctx = (): GameContext => ({
    now: clock.now,
    random: () => ((seed = (seed * 9301 + 49297) % 233280) / 233280),
    announce: () => {},
    isConnected: (id) => !away.has(id),
  });
  const players: PlayerInfo[] = ids.map((id, i) => ({
    id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: teamOf ? teamOf(i) : null,
  }));
  const state = sketch.setup(players, { drawSeconds: 80, rounds: 1, hints: 'on', ...config }, ctx());
  const tickFor = (ms: number) => {
    const end = clock.now + ms;
    while (clock.now < end) {
      clock.now = Math.min(end, clock.now + 250);
      sketch.tick!(state, ctx());
    }
  };
  return { state, ctx, clock, away, tickFor };
}

test('guess matching, near misses and spoiler detection', () => {
  assert.ok(isCorrect('Ice Cream', 'ice cream'));
  assert.ok(isCorrect('icecream', 'ice cream'));
  assert.ok(isCorrect('apples', 'apple'));
  assert.ok(!isCorrect('appl', 'apple'));
  assert.ok(isClose('appel', 'apple'));
  assert.ok(isClose('lighthous', 'lighthouse'));
  assert.ok(!isClose('cat', 'car'), 'short words never trigger close hints');
  assert.ok(mentionsWord('lol is it a cat?', 'cat'));
  assert.ok(!mentionsWord('what category is this', 'cat'));
  assert.ok(mentionsWord('maybe icecream', 'ice cream'));
});

test('free-for-all with two players: choose, guess, score, rotate, finish', () => {
  const { state, ctx, tickFor } = harness(['a', 'b']);
  assert.equal(state.mode, 'ffa');
  const drawer = state.drawerId;
  const guesser = drawer === 'a' ? 'b' : 'a';

  assert.equal(sketch.view(state, guesser).choices, null, 'only the drawer sees the choices');
  assert.equal(sketch.view(state, drawer).choices!.length, 3);
  assert.ok(sketch.action(state, guesser, { type: 'choose', index: 0 }, ctx()));
  sketch.action(state, drawer, { type: 'choose', index: 1 }, ctx());
  const word = state.word!;

  const gv = sketch.view(state, guesser);
  assert.equal(gv.word, null, 'guessers never get the word');
  assert.equal(gv.mask!.length, word.length);
  assert.equal(sketch.view(state, drawer).word, word);

  sketch.action(state, guesser, { type: 'guess', text: 'definitely wrong' }, ctx());
  assert.equal(sketch.view(state, drawer).feed.at(-1)!.text, 'definitely wrong');
  assert.ok(sketch.action(state, drawer, { type: 'guess', text: word }, ctx()), 'the drawer cannot guess');

  tickFor(20_000);
  sketch.action(state, guesser, { type: 'guess', text: word }, ctx());
  assert.ok(state.scores[guesser] > 100 && state.scores[guesser] <= 300, `speed points, got ${state.scores[guesser]}`);
  assert.equal(state.scores[drawer], 60);
  assert.equal(state.phase, 'reveal', 'turn ends once everyone has guessed');
  assert.equal(sketch.view(state, guesser).word, word, 'the word is revealed to all');

  tickFor(5_000);
  assert.equal(state.phase, 'choosing');
  assert.equal(state.drawerId, guesser, 'the other player draws next');
  tickFor(15_000);
  assert.equal(state.phase, 'drawing', 'a word is auto-picked if the drawer stalls');
  tickFor(80_000);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.lastResult!.reason, 'time');
  tickFor(5_000);
  assert.equal(state.phase, 'over', 'one round = everyone draws once');
  assert.deepEqual(sketch.view(state, 'a').winners, [guesser]);
});

test('close guesses get a private hint and letters reveal over time', () => {
  const { state, ctx, tickFor } = harness(['a', 'b', 'c']);
  const drawer = state.drawerId;
  const [g1, g2] = ['a', 'b', 'c'].filter((id) => id !== drawer);
  sketch.action(state, drawer, { type: 'choose', index: 1 }, ctx());
  const word = state.word!;
  const near = word.slice(0, -1) + (word.endsWith('z') ? 'y' : 'z');
  sketch.action(state, g1, { type: 'guess', text: near }, ctx());
  if (isClose(near, word)) {
    assert.ok(sketch.view(state, g1).feed.some((f) => f.kind === 'close'));
    assert.ok(!sketch.view(state, g2).feed.some((f) => f.kind === 'close'), 'close hints are private');
  }
  const hidden = () => sketch.view(state, g1).mask!.filter((c) => c === null).length;
  const before = hidden();
  tickFor(70_000);
  assert.ok(hidden() < before, 'some letters were revealed');
  assert.ok(hidden() >= Math.ceil(word.replace(/[^a-z0-9]/gi, '').length / 2), 'never more than half');

  sketch.action(state, g1, { type: 'guess', text: word }, ctx());
  sketch.action(state, g1, { type: 'guess', text: 'so easy' }, ctx());
  assert.ok(!sketch.view(state, g2).feed.some((f) => f.text === 'so easy'), 'post-guess chat stays with insiders');
  assert.ok(sketch.view(state, drawer).feed.some((f) => f.text === 'so easy'));
  assert.ok(sketch.filterChat!(state, g2, `it is ${word}`), 'room chat cannot spoil the word');
});

test('only the drawer can stream, and ops reset each turn', () => {
  const { state, ctx, tickFor } = harness(['a', 'b']);
  const drawer = state.drawerId;
  const other = drawer === 'a' ? 'b' : 'a';
  assert.equal(sketch.stream!(state, drawer, { t: 'clear' }, ctx()), null, 'no drawing before a word is picked');
  sketch.action(state, drawer, { type: 'choose', index: 0 }, ctx());
  const ev = sketch.stream!(state, drawer, { t: 'begin', id: 1, x: 10, y: 9999, size: 6, color: '#ff0000' }, ctx()) as { seq: number; op: { y: number } };
  assert.equal(ev.seq, 1);
  assert.equal(ev.op.y, 600, 'coordinates are clamped to the canvas');
  assert.equal(sketch.stream!(state, other, { t: 'clear' }, ctx()), null);
  assert.equal(sketch.stream!(state, drawer, { t: 'begin', id: 2, x: 1, y: 1, size: 6, color: 'red' }, ctx()), null, 'bad colours rejected');
  sketch.stream!(state, drawer, { t: 'pts', id: 1, pts: [20, 20, 30, 30] }, ctx());
  assert.equal((sketch.streamSync!(state, other) as { ops: unknown[] }).ops.length, 2);
  tickFor(85_000);
  assert.equal((sketch.streamSync!(state, other) as { ops: unknown[] }).ops.length, 0, 'new turn starts blank');
});

test('a drawer who leaves is skipped', () => {
  const { state, away, tickFor } = harness(['a', 'b', 'c']);
  const drawer = state.drawerId;
  away.add(drawer);
  tickFor(10_500);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.lastResult!.reason, 'skipped');
  tickFor(5_000);
  assert.notEqual(state.drawerId, drawer);
});

test('teams mode: only the drawing team guesses, then the other team can steal', () => {
  const { state, ctx, tickFor } = harness(['a', 'b', 'c', 'd', 'e'], { mode: 'teams' }, (i) => i % 2);
  assert.equal(state.mode, 'teams');
  assert.deepEqual(state.teams!.map((t) => t.length).sort(), [2, 3], 'uneven teams are fine');
  const team = state.activeTeam;
  const drawer = state.drawerId;
  assert.ok(state.teams![team].includes(drawer));
  const mate = state.teams![team].find((id) => id !== drawer)!;
  const rival = state.teams![1 - team][0];
  sketch.action(state, drawer, { type: 'choose', index: 0 }, ctx());
  const word = state.word!;

  assert.equal(sketch.view(state, rival).role, 'watcher');
  assert.ok(sketch.action(state, rival, { type: 'guess', text: word }, ctx()), 'rivals wait for the steal');
  sketch.action(state, mate, { type: 'guess', text: 'nope' }, ctx());
  tickFor(80_000);
  assert.equal(state.phase, 'steal');
  assert.equal(sketch.view(state, rival).role, 'stealer');
  assert.ok(sketch.action(state, mate, { type: 'guess', text: word }, ctx()), 'drawing team is locked out during the steal');
  sketch.action(state, rival, { type: 'guess', text: word }, ctx());
  assert.equal(state.teamScores[1 - team], STEAL_POINTS);
  assert.equal(state.lastResult!.reason, 'stolen');

  tickFor(5_000);
  assert.equal(state.activeTeam, 1 - team, 'teams alternate');
});

test('teams mode falls back to free-for-all under 4 players', () => {
  const { state } = harness(['a', 'b', 'c'], { mode: 'teams' });
  assert.equal(state.mode, 'ffa');
  assert.equal(state.teams, null);
});
