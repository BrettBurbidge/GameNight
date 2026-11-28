import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactOps, type DrawOp } from '../../drawing';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { AUTO_FLIP_MS, AWAY_MS, holderSeat, PROMPT_MS, scribbleChain as game, stepsFor } from './logic';

function harness(count: number, config: Record<string, string | number> = {}) {
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  const clock = { now: 1_000_000 };
  const away = new Set<string>();
  let seed = 11;
  const ctx = (): GameContext => ({
    now: clock.now,
    random: () => ((seed = (seed * 9301 + 49297) % 233280) / 233280),
    announce: () => {},
    isConnected: (id) => !away.has(id),
    isHost: (id) => id === 'p0',
  });
  const players: PlayerInfo[] = ids.map((id) => ({ id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: null }));
  const state = game.setup(players, { drawSeconds: 60, guessSeconds: 30, prompts: 'deck', ...config }, ctx());
  const tickFor = (ms: number) => {
    const end = clock.now + ms;
    while (clock.now < end) {
      clock.now = Math.min(end, clock.now + 250);
      game.tick!(state, ctx());
    }
  };
  const act = (id: string, action: Parameters<typeof game.action>[2]) => game.action(state, id, action, ctx());
  /** A one-stroke drawing whose first point marks who drew it and when. */
  const scribble = (id: string) => {
    const x = Number(id.slice(1)) * 10 + state.step;
    game.stream!(state, id, { t: 'begin', id: 1, color: '#111827', size: 10, x, y: 5 }, ctx());
    game.stream!(state, id, { t: 'pts', id: 1, pts: [x + 20, 40, x + 60, 90] }, ctx());
  };
  const everyone = (fn: (id: string) => void) => [...state.players].forEach(fn);
  /** Plays every pass with everyone taking part. */
  const playThrough = () => {
    everyone((id) => act(id, { type: 'choose', index: 0 }));
    while (state.phase === 'draw' || state.phase === 'guess') {
      const step = state.step;
      if (state.phase === 'draw') everyone((id) => (scribble(id), act(id, { type: 'done' })));
      else everyone((id) => act(id, { type: 'guess', text: `${id} guess ${step}` }));
      assert.ok(state.step > step || (state.phase as string) === 'reveal', 'the step closes once everyone is in');
    }
  };
  return { state, ctx, clock, away, tickFor, act, scribble, everyone, playThrough, ids };
}

test('every book ends on a guess and nobody sees the same book twice', () => {
  assert.deepEqual([3, 4, 5, 6, 7, 8, 9, 10].map(stepsFor), [2, 4, 4, 6, 6, 8, 8, 8]);
  for (let n = 3; n <= 10; n++) {
    const steps = stepsFor(n);
    assert.equal(steps % 2, 0);
    for (let book = 0; book < n; book++) {
      const seats = Array.from({ length: steps }, (_, i) => holderSeat(book, i + 1, n));
      assert.equal(new Set(seats).size, steps, `${n} players: no repeat visits`);
      // Only at an even table does the owner work on their own book, and only to draw their own word.
      assert.equal(seats.indexOf(book), n % 2 ? -1 : 0);
    }
    for (let step = 1; step <= steps; step++) {
      const seats = Array.from({ length: n }, (_, book) => holderSeat(book, step, n));
      assert.equal(new Set(seats).size, n, `${n} players: everyone holds exactly one book`);
    }
  }
});

test('compacting a drawing drops undone and cleared work', () => {
  const stroke = (id: number): DrawOp[] => [
    { t: 'begin', id, color: '#000000', size: 4, x: 10, y: 10 },
    { t: 'pts', id, pts: [11, 10, 50, 50] },
    { t: 'pts', id, pts: [51, 50, 90, 90] },
  ];
  assert.deepEqual(compactOps([...stroke(1), { t: 'clear' }]), []);
  assert.deepEqual(compactOps([...stroke(1), { t: 'undo' }]), []);
  const out = compactOps([...stroke(7), { t: 'fill', x: 1, y: 1, color: '#ff0000' }, ...stroke(8), { t: 'undo' }]);
  assert.deepEqual(out, [
    { t: 'begin', id: 1, color: '#000000', size: 4, x: 10, y: 10 },
    { t: 'pts', id: 1, pts: [50, 50, 90, 90] },
    { t: 'fill', x: 1, y: 1, color: '#ff0000' },
  ]);
});

test('a full game with five players: pick, draw, guess, pass, reveal', () => {
  const h = harness(5);
  const { state, act } = h;
  const [a, b] = state.players;

  assert.equal(game.view(state, a).choices!.length, 3);
  assert.equal(game.view(state, 'stranger').choices, null);
  assert.ok(act(a, { type: 'write', text: 'my own' }), 'deck games do not take written prompts');
  act(a, { type: 'choose', index: 1 });
  assert.equal(game.view(state, a).myPrompt, state.choices[a][1]);
  assert.equal(game.view(state, b).myPrompt, null);
  assert.equal(state.phase, 'prompt');
  h.everyone((id) => act(id, { type: 'choose', index: 0 }));
  assert.equal(state.phase, 'draw');
  assert.equal(state.steps, 4);

  // Odd table: book 0 (a's word) is now with seat 1.
  const task = game.view(state, b).task!;
  assert.deepEqual(task, { kind: 'draw', text: state.choices[a][0], from: a });
  assert.ok(act(b, { type: 'done' }), 'a blank page cannot be handed in');
  h.scribble(b);
  assert.equal((game.streamSync!(state, b) as any).ops.length, 2, 'your own page comes back on reconnect');
  assert.equal((game.streamSync!(state, a) as any).ops.length, 0, 'and nobody else gets it');
  act(b, { type: 'done' });
  assert.deepEqual(game.view(state, a).done, [b]);
  game.stream!(state, b, { t: 'clear' }, h.ctx());
  assert.equal(state.work[b].ops.length, 2, 'a handed-in page is locked');
  act(b, { type: 'edit' });
  assert.deepEqual(game.view(state, a).done, []);
  h.everyone((id) => (h.scribble(id), act(id, { type: 'done' })));
  assert.equal(state.phase, 'guess');

  // Seat 2 now guesses b's drawing of a's word, and only sees that one picture.
  const c = state.players[2];
  const cv = game.view(state, c);
  assert.deepEqual(cv.task, { kind: 'guess', key: 's2', from: b, blank: false });
  assert.equal(JSON.stringify(cv).includes(state.choices[a][0]), false, 'the word behind the drawing stays hidden');
  const sync = game.streamSync!(state, c) as any;
  assert.deepEqual(Object.keys(sync.drawings), ['s2']);
  assert.equal(sync.drawings.s2[0].x, Number(b.slice(1)) * 10 + 1, 'it is the drawing seat 1 made in step 1');
  assert.deepEqual((game.streamSync!(state, 'stranger') as any).drawings, {});

  act(c, { type: 'guess', text: '  a   wonky    boat ', draft: true });
  assert.equal(game.view(state, c).myGuess, 'a wonky boat');
  assert.deepEqual(game.view(state, c).done, []);
  assert.ok(act(c, { type: 'guess', text: '   ' }));
  h.everyone((id) => act(id, { type: 'guess', text: `${id} guess 2` }));
  assert.equal(state.phase, 'draw');
  assert.equal(state.step, 3);
  assert.deepEqual(game.view(state, state.players[3]).task, { kind: 'draw', text: `${c} guess 2`, from: c });

  h.everyone((id) => (h.scribble(id), act(id, { type: 'done' })));
  h.everyone((id) => act(id, { type: 'guess', text: `${id} guess 4` }));
  assert.equal(state.phase, 'reveal');
  for (const book of state.books) {
    assert.deepEqual(book.entries.map((e) => e.kind), ['word', 'draw', 'guess', 'draw', 'guess']);
    assert.equal(new Set(book.entries.map((e) => e.by)).size, 5);
  }
});

test('an even table: owners draw their own word first', () => {
  const h = harness(4);
  h.everyone((id) => h.act(id, { type: 'choose', index: 2 }));
  const [a] = h.state.players;
  assert.deepEqual(game.view(h.state, a).task, { kind: 'draw', text: h.state.choices[a][2], from: a });
});

test('the clock fills in for anyone who did not finish', () => {
  const h = harness(5);
  const { state, act } = h;
  const [a, b, c, d] = state.players;
  act(a, { type: 'choose', index: 2 });
  h.tickFor(PROMPT_MS);
  assert.equal(state.phase, 'draw');
  assert.equal(state.books[0].entries[0].missed, false);
  assert.equal(state.books[1].entries[0].missed, true);
  assert.ok(state.choices[b].includes((state.books[1].entries[0] as any).text));

  // b draws but never taps done; c draws nothing.
  h.scribble(b);
  h.tickFor(60_000);
  assert.equal(state.phase, 'guess');
  assert.equal(state.books[0].entries[1].missed, false, 'an unfinished drawing still counts');
  assert.equal(state.books[1].entries[1].missed, true);
  assert.equal(game.view(state, d).task!.kind === 'guess' && (game.view(state, d).task as any).blank, true);

  // A half-typed guess is kept; a missing one repeats the words before it.
  act(c, { type: 'guess', text: 'half a gue', draft: true });
  h.tickFor(30_000);
  assert.equal(state.phase, 'draw');
  assert.deepEqual(state.books[0].entries[2], { kind: 'guess', by: c, text: 'half a gue', missed: false });
  assert.deepEqual(state.books[1].entries[2], { kind: 'guess', by: d, text: (state.books[1].entries[0] as any).text, missed: true });
});

test('players who drop out are not waited for', () => {
  const h = harness(5);
  const { state, act, away } = h;
  const gone = state.players[4];
  away.add(gone);
  state.players.slice(0, 4).forEach((id) => act(id, { type: 'choose', index: 0 }));
  h.tickFor(AWAY_MS - 500);
  assert.equal(state.phase, 'prompt', 'a brief drop is given a moment');
  h.tickFor(1000);
  assert.equal(state.phase, 'draw');

  // Back in time: they are waited for again.
  away.delete(gone);
  h.tickFor(250);
  state.players.slice(0, 4).forEach((id) => (h.scribble(id), act(id, { type: 'done' })));
  h.tickFor(2000);
  assert.equal(state.phase, 'draw');
  h.scribble(gone);
  act(gone, { type: 'done' });
  assert.equal(state.phase, 'guess');
});

test('the reveal: the owner or host flips, pages appear one at a time, then the next book', () => {
  const h = harness(5);
  const { state, act, away } = h;
  h.playThrough();
  assert.equal(state.phase, 'reveal');
  const owner = state.players[0];
  const other = state.players.find((id) => id !== owner && id !== 'p0')!;

  let v = game.view(state, other).reveal!;
  assert.equal(v.owner, owner);
  assert.equal(v.pages.length, 1);
  assert.equal(v.totalPages, 5);
  assert.deepEqual((game.streamSync!(state, other) as any).drawings, {}, 'unflipped drawings are not sent');
  assert.ok(act(other, { type: 'next' }), 'only the owner or host flips');
  assert.equal(act(owner, { type: 'next' }), undefined);
  assert.equal(act('p0', { type: 'next' }), undefined, 'the host can flip too');
  v = game.view(state, other).reveal!;
  assert.deepEqual(v.pages.map((p) => p.kind), ['word', 'draw', 'guess']);
  assert.deepEqual(Object.keys((game.streamSync!(state, 'stranger') as any).drawings), ['b0p1'], 'spectators watch the reveal too');

  act(owner, { type: 'next' });
  act(owner, { type: 'next' });
  assert.equal(game.view(state, other).reveal!.pages.length, 5);
  act(owner, { type: 'next' });
  v = game.view(state, other).reveal!;
  assert.equal(v.book, 1);
  assert.equal(v.pages.length, 1);

  // An absent owner's book flips itself, and anyone seated can hurry it along.
  const second = state.players[1];
  away.add(second);
  h.tickFor(AWAY_MS + AUTO_FLIP_MS);
  assert.ok(game.view(state, other).reveal!.pages.length >= 2);
  assert.equal(act(other, { type: 'next' }), undefined);
  assert.ok(act('stranger', { type: 'next' }));
  away.delete(second);

  for (let i = 0; i < 40 && state.phase === 'reveal'; i++) act('p0', { type: 'next' });
  assert.equal(state.phase, 'over');
  assert.ok(game.isFinished(state));
  const books = game.view(state, other).books!;
  assert.equal(books.length, 5);
  assert.equal(books[0].owner, owner);
  assert.deepEqual(books[0].pages.map((p) => p.kind), ['word', 'draw', 'guess', 'draw', 'guess']);
  assert.equal((books[0].pages[0] as any).text, state.choices[owner][0]);
  assert.match((books[0].pages[4] as any).text, /guess 4$/);
  const all = (game.streamSync!(state, other) as any).drawings;
  assert.equal(Object.keys(all).length, 10, 'every drawing can be fetched once it is over');
  assert.ok(all[(books[3].pages[1] as any).key].length);
});

test('write-your-own prompts', () => {
  const h = harness(4, { prompts: 'custom' });
  const { state, act } = h;
  const [a] = state.players;
  assert.ok(act(a, { type: 'write', text: '   ' }));
  act(a, { type: 'write', text: 'a dog   doing taxes' });
  assert.equal(game.view(state, a).myPrompt, 'a dog doing taxes');
  h.everyone((id) => id !== a && act(id, { type: 'write', text: `${id} idea` }));
  assert.equal(state.phase, 'draw');
  assert.equal((state.books[0].entries[0] as any).text, 'a dog doing taxes');
});
