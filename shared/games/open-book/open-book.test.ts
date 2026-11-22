import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { NOTE_SECONDS } from './limits';
import { openBook } from './logic';
import { CHAPTERS } from './pages';

const seat = (ids: string[]): PlayerInfo[] =>
  ids.map((id) => ({ id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: null }));

function table(ids: string[], config: Record<string, string | number> = {}) {
  const clock = { now: 1000 };
  const away = new Set<string>();
  const said: string[] = [];
  const ctx = (): GameContext => ({ now: clock.now, random: () => 0.4, announce: (t) => said.push(t), isConnected: (id) => !away.has(id) });
  const state = openBook.setup(seat(ids), config, ctx());
  type Move = { type: 'pass' | 'next' | 'vote' } | { type: 'pick'; playerId: string } | { type: 'note'; text: string };
  /** Sends a move the way the board does: stamped with the page or chapter the player is looking at. */
  const act = (id: string, move: Move) => openBook.action(state, id, { seq: state.pageSeq, chapter: state.chapter, ...move } as never, ctx());
  /** Deals pages until the open one is of the wanted kind. */
  const until = (kind: string) => {
    for (let i = 0; i < 200 && openBook.view(state, ids[0]).page!.kind !== kind; i++) act(state.readerId, { type: 'pass' });
    assert.equal(openBook.view(state, ids[0]).page!.kind, kind);
  };
  return { state, clock, away, said, ctx, act, until };
}

test('the deck is well formed', () => {
  assert.equal(CHAPTERS.length, 3);
  const seen = new Set<string>();
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.pages.length >= 24, `${chapter.title} has enough pages for a long game with passes`);
    for (const [kind, text] of chapter.pages) {
      assert.ok(['reader', 'pick', 'all'].includes(kind));
      assert.ok(!seen.has(text), `duplicate page: ${text}`);
      seen.add(text);
      if (kind !== 'all') assert.ok(!text.includes('{reader}'), `only "everyone" pages name the reader: ${text}`);
    }
  }
});

test('reading, picking, passing and turning pages', () => {
  const { state, act, until } = table(['a', 'b', 'c'], { pagesPerChapter: 2 });
  const reader = state.readerId;
  const [x, y] = state.order.filter((id) => id !== reader);

  until('pick');
  assert.ok(act(x, { type: 'pick', playerId: y }), 'only the reader picks');
  assert.ok(act(reader, { type: 'pick', playerId: reader }), 'the reader cannot pick themselves');
  assert.ok(act(y, { type: 'next' }), 'bystanders cannot turn the page');
  assert.equal(act(reader, { type: 'pick', playerId: x }), undefined);
  assert.equal(openBook.view(state, y).answererId, x);

  // The person answering can pass; it swaps the page without using up the chapter.
  const seq = state.pageSeq;
  assert.equal(act(x, { type: 'pass' }), undefined);
  assert.equal(state.pageSeq, seq + 1);
  assert.equal(state.pageInChapter, 1);
  assert.equal(state.answererId, null);
  assert.ok(act(x, { type: 'pass' }), 'and then no longer holds the page');

  until('reader');
  assert.ok(act(reader, { type: 'pick', playerId: x }), 'no picking on other kinds of page');
  act(reader, { type: 'next' });
  assert.equal(state.pageInChapter, 2);
  assert.notEqual(state.readerId, reader, 'reading passes round the circle');
  assert.ok(act('ghost', { type: 'next' }), 'spectators cannot act');
});

test('passing never repeats a page until the chapter runs out', () => {
  const { state, act } = table(['a', 'b']);
  const total = CHAPTERS[0].pages.length;
  const seen = new Set([state.pageIndex]);
  for (let i = 1; i < total; i++) {
    act(state.readerId, { type: 'pass' });
    seen.add(state.pageIndex);
  }
  assert.equal(seen.size, total);
  assert.equal(act(state.readerId, { type: 'pass' }), undefined, 'then the chapter reshuffles');
});

test('chapters advance by page count or by majority vote, and a missing reader is skipped', () => {
  const { state, away, said, ctx, act } = table(['a', 'b', 'c', 'd'], { pagesPerChapter: 2 });
  assert.equal(openBook.view(state, 'a').votesNeeded, 3);
  act(state.readerId, { type: 'next' });
  act(state.readerId, { type: 'next' });
  assert.equal(state.chapter, 1);
  assert.equal(state.pageInChapter, 1);

  act('a', { type: 'vote' });
  act('a', { type: 'vote' });
  assert.deepEqual(state.votes, [], 'votes toggle');
  act('a', { type: 'vote' });
  act('b', { type: 'vote' });
  assert.equal(state.chapter, 1);

  // Someone drops: the majority shrinks, and anyone can move things along if it was the reader.
  const gone = state.readerId;
  const stayer = state.order.find((id) => id !== gone)!;
  away.add(gone);
  assert.ok(openBook.tick!(state, ctx()));
  assert.equal(openBook.view(state, stayer).votesNeeded, 2);
  assert.equal(act(stayer, { type: 'next' }), undefined);
  assert.notEqual(state.readerId, gone);
  away.delete(gone);
  openBook.tick!(state, ctx());

  act('c', { type: 'vote' });
  assert.equal(state.chapter, 2, 'three of four is a majority');
  assert.deepEqual(state.votes, []);
  assert.deepEqual(said, ['Chapter 2: Between the Lines.', 'Chapter 3: Unedited.']);
});

test('a stale click cannot skip twice', () => {
  const { state, ctx } = table(['a', 'b', 'c'], { pagesPerChapter: 5 });
  const reader = state.readerId;
  const seq = state.pageSeq;
  openBook.action(state, reader, { type: 'next', seq }, ctx());
  openBook.action(state, reader, { type: 'next', seq }, ctx());
  openBook.action(state, reader, { type: 'pass', seq }, ctx());
  assert.equal(state.pageSeq, seq + 1);
  assert.equal(state.pageInChapter, 2);

  openBook.action(state, 'a', { type: 'vote', chapter: 0 }, ctx());
  openBook.action(state, 'b', { type: 'vote', chapter: 0 }, ctx());
  assert.equal(state.chapter, 1);
  openBook.action(state, 'c', { type: 'vote', chapter: 0 }, ctx());
  assert.deepEqual(state.votes, [], 'a vote for the old chapter does not count towards the new one');
});

test('closing notes are a private ring, delivered together', () => {
  const { state, clock, away, ctx, act } = table(['a', 'b', 'c', 'd'], { pagesPerChapter: 1 });
  away.add('d');
  for (let i = 0; i < 3; i++) act(state.readerId, { type: 'next' });
  assert.equal(state.phase, 'notes');
  assert.equal(openBook.view(state, 'a').page, null);

  // d is away, so the ring is a, b and c: everyone writes one and is owed one.
  assert.deepEqual(Object.keys(state.pairs).sort(), ['a', 'b', 'c']);
  assert.deepEqual(Object.values(state.pairs).sort(), ['a', 'b', 'c']);
  for (const id of ['a', 'b', 'c']) assert.notEqual(state.pairs[id], id);
  assert.ok(act('d', { type: 'note', text: 'hi' }), 'no pair, no note');
  assert.equal(openBook.addPlayer!(state, seat(['e'])[0], ctx()), false, 'too late to join');

  assert.ok(act('a', { type: 'note', text: '   ' }));
  act('a', { type: 'note', text: 'first draft' });
  act('a', { type: 'note', text: '  you are braver than you think  ' });
  act('b', { type: 'note', text: 'thank you for tonight' });
  const reader = state.pairs.a;
  assert.equal(openBook.view(state, 'a').myNote, 'you are braver than you think');
  assert.equal(openBook.view(state, reader).received, null, 'nothing is delivered early');
  assert.deepEqual(openBook.view(state, 'c').submitted.sort(), ['a', 'b']);

  // c never writes; the timer delivers what there is.
  clock.now += NOTE_SECONDS * 1000 + 1;
  assert.ok(openBook.tick!(state, ctx()));
  assert.ok(openBook.isFinished(state));
  assert.deepEqual(openBook.view(state, reader).received, { from: 'a', text: 'you are braver than you think' });
  const owedByC = state.pairs.c;
  assert.equal(openBook.view(state, owedByC).received, null);
  for (const id of ['a', 'b', 'c', 'd', 'ghost']) {
    const v = JSON.stringify(openBook.view(state, id));
    const mayRead = id === 'a' || id === reader;
    assert.equal(v.includes('braver'), mayRead, `${id} ${mayRead ? 'can' : 'cannot'} read a's note`);
  }
});

test('two players write to each other and finish as soon as both are in; latecomers join the circle', () => {
  const { state, ctx, act } = table(['a', 'b'], { pagesPerChapter: 1 });
  assert.equal(openBook.validateStart!(seat(['a']), {}), 'You need at least 2 players.');
  assert.deepEqual(openBook.addPlayer!(state, seat(['c'])[0], ctx()), { team: null });
  assert.equal(openBook.view(state, 'c').role, 'player');
  for (let i = 0; i < 3; i++) act(state.readerId, { type: 'next' });
  assert.equal(state.phase, 'notes');
  for (const id of ['a', 'b', 'c']) act(id, { type: 'note', text: `from ${id}` });
  assert.ok(openBook.isFinished(state));
  assert.equal(openBook.view(state, state.pairs.c).received!.text, 'from c');
});
