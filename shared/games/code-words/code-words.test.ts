import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { BOARD_SIZE, codeWords } from './logic';
import type { CodeWordsAction } from './types';
import { BOARD_WORDS } from './words';

const seat = (ids: string[]): PlayerInfo[] =>
  ids.map((id, i) => ({ id, name: id, avatar: '', color: '', isBot: false, connected: true, spectator: false, team: i % 2 }));

function table(ids: string[], config: Record<string, string | number> = {}) {
  const clock = { now: 1000 };
  const away = new Set<string>();
  const said: string[] = [];
  const ctx = (): GameContext => ({ now: clock.now, random: Math.random, announce: (t) => said.push(t), isConnected: (id) => !away.has(id) });
  const state = codeWords.setup(seat(ids), config, ctx());
  const act = (id: string, action: CodeWordsAction) => codeWords.action(state, id, action, ctx());
  const view = (id: string) => codeWords.view(state, id);
  /** Both ciphers send a clue, which opens the guessing. */
  const clueUp = (a = 'hot thing', b = 'cold thing') => {
    act(state.cipherIds[0], { type: 'clue', text: a });
    act(state.cipherIds[1], { type: 'clue', text: b });
  };
  return { state, clock, away, said, ctx, act, view, clueUp };
}

test('the board pool is well formed', () => {
  assert.ok(BOARD_WORDS.length >= 100);
  assert.equal(new Set(BOARD_WORDS).size, BOARD_WORDS.length, 'no duplicates');
  for (const w of BOARD_WORDS) assert.match(w, /^[A-Z]+$/, `${w} is a single plain word`);
});

test('a board is dealt without repeats, and two words go up each round', () => {
  const { state } = table(['a', 'b', 'c', 'd']);
  assert.equal(state.board.length, BOARD_SIZE);
  assert.equal(new Set(state.board).size, BOARD_SIZE);
  assert.notEqual(state.targets[0], state.targets[1]);
  assert.ok(state.board.every((w) => BOARD_WORDS.includes(w)));
});

test('clues: cipher only, two words, no digits, nothing off the board', () => {
  const { state, act, view } = table(['a', 'b', 'c', 'd']);
  const cipher = state.cipherIds[0];
  const guesser = state.teams[0].find((id) => id !== cipher)!;
  const onBoard = state.board[5];

  assert.ok(act(guesser, { type: 'clue', text: 'nope' }), 'guessers do not clue');
  assert.ok(act(cipher, { type: 'clue', text: '   ' }));
  assert.ok(act(cipher, { type: 'clue', text: 'row 3' }), 'digits could encode a position');
  assert.ok(act(cipher, { type: 'clue', text: 'three whole words' }));
  assert.match(act(cipher, { type: 'clue', text: `${onBoard.toLowerCase()}s` }) as string, /on the board/);
  assert.ok(act(guesser, { type: 'pick', slot: 'crack', wordIndex: 1 }), 'no guessing before the clues land');

  assert.equal(act(cipher, { type: 'clue', text: '  Molten   rock ' }), undefined);
  assert.equal(state.clues[0], 'Molten rock');
  assert.ok(act(cipher, { type: 'clue', text: 'again' }), 'one clue per round');
  assert.equal(state.phase, 'clue', 'still waiting on the other cipher');
  assert.deepEqual(view(guesser).clueSent, [true, false]);
  assert.equal(view(guesser).clues[0], null, 'teammates do not get an early look');
  assert.equal(view(cipher).clues[0], 'Molten rock', 'the cipher sees their own');
});

test('hidden information holds: only your cipher sees your word, and picks stay private', () => {
  const { state, act, view, clueUp } = table(['a', 'b', 'c', 'd']);
  const [c0, c1] = state.cipherIds;
  const g0 = state.teams[0].find((id) => id !== c0)!;
  const g1 = state.teams[1].find((id) => id !== c1)!;

  assert.equal(view(c0).myTarget, state.targets[0]);
  assert.equal(view(c1).myTarget, state.targets[1]);
  for (const id of [g0, g1, 'watcher']) assert.equal(view(id).myTarget, null);
  const leaked = JSON.stringify(view(g0));
  assert.ok(!leaked.includes(`"targets"`), 'the targets are not shipped to guessers');

  clueUp();
  act(g0, { type: 'pick', slot: 'crack', wordIndex: state.targets[0] });
  assert.equal(view(g0).myPicks.crack, state.targets[0]);
  assert.equal(view(g1).myPicks.crack, null, 'the other team cannot see it');
  assert.deepEqual(view(g1).tally.crack, {}, 'nor count it');
  assert.deepEqual(view(g0).tally.crack, { [state.targets[0]]: 1 }, 'teammates see the count');
  assert.equal(view('watcher').role, 'spectator');
});

test('scoring: cracking is worth two, intercepting one', () => {
  const { state, act, view, clueUp } = table(['a', 'b', 'c', 'd'], { rounds: 4 });
  const [c0, c1] = state.cipherIds;
  const g0 = state.teams[0].find((id) => id !== c0)!;
  const g1 = state.teams[1].find((id) => id !== c1)!;
  const [t0, t1] = state.targets;
  clueUp();

  // Team 0 reads its own clue and the other team's. Team 1 gets neither.
  act(g0, { type: 'pick', slot: 'crack', wordIndex: t0 });
  act(g0, { type: 'pick', slot: 'intercept', wordIndex: t1 });
  const miss = state.board.map((_, i) => i).find((i) => i !== t0 && i !== t1)!;
  act(g1, { type: 'pick', slot: 'crack', wordIndex: miss });
  assert.ok(act(c0, { type: 'lock' }), 'ciphers cannot lock in');
  act(g0, { type: 'lock' });
  assert.equal(state.phase, 'guess', 'the other team is still deciding');
  act(g1, { type: 'lock' });

  assert.equal(state.phase, 'reveal');
  const result = view(g1).result!;
  assert.deepEqual(result.cracked, [true, false]);
  assert.deepEqual(result.intercepted, [true, false]);
  assert.deepEqual(result.gained, [3, 0]);
  assert.deepEqual(state.scores, [3, 0]);
  assert.deepEqual(result.targets, [t0, t1]);
  assert.equal(state.claimed[t0], 0);
  assert.equal(state.claimed[t1], 1);
  assert.equal(view(g1).myTarget, null);
  assert.equal(view(c0).myTarget, null, 'the word is public now, so nothing is marked secret');

  assert.ok(act(g0, { type: 'pick', slot: 'crack', wordIndex: 0 }), 'guessing is closed');
  assert.ok(act('watcher', { type: 'next', round: 0 }), 'spectators cannot move the round on');
  act(g0, { type: 'next', round: 0 });
  assert.equal(state.round, 1);
  act(g0, { type: 'next', round: 0 });
  assert.equal(state.round, 1, 'a stale click does not skip a round');
  assert.ok(act(state.cipherIds[0], { type: 'clue', text: state.board[state.targets[0]] }), 'the new target is still off limits as a clue');
});

test('the team goes with the most popular pick, and ties go to whoever locked first', () => {
  const { state, act, view, clueUp } = table(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  const [c0, c1] = state.cipherIds;
  const [g1, g2, g3] = state.teams[0].filter((id) => id !== c0);
  const [t0] = state.targets;
  const other = state.board.map((_, i) => i).filter((i) => i !== t0 && i !== state.targets[1]);
  clueUp();

  act(g1, { type: 'pick', slot: 'crack', wordIndex: other[0] });
  act(g2, { type: 'pick', slot: 'crack', wordIndex: t0 });
  act(g3, { type: 'pick', slot: 'crack', wordIndex: t0 });
  for (const id of [...state.teams[1].filter((x) => x !== c1), g1, g2, g3]) act(id, { type: 'lock' });
  assert.equal(view(c0).result!.answers[0].crack, t0, 'two beats one');
  assert.ok(view(c0).result!.cracked[0]);

  // Next round: the cipher seat has moved on, and a 1-1 split falls to the earlier lock.
  act(g1, { type: 'next', round: 0 });
  const cipher = state.cipherIds[0];
  const [h1, h2, h3] = state.teams[0].filter((id) => id !== cipher);
  clueUp('warm', 'chilly');
  const n0 = state.targets[0];
  const wrong = state.board.map((_, i) => i).find((i) => state.claimed[i] === null && i !== n0 && i !== state.targets[1])!;
  act(h2, { type: 'pick', slot: 'crack', wordIndex: wrong });
  act(h2, { type: 'lock' });
  act(h1, { type: 'pick', slot: 'crack', wordIndex: n0 });
  act(h1, { type: 'lock' });
  for (const id of [...state.teams[1].filter((x) => x !== state.cipherIds[1]), h3]) act(id, { type: 'lock' });
  assert.equal(view(cipher).result!.answers[0].crack, wrong, 'the earlier lock breaks the tie');
});

test('timers move the round along, and a silent cipher simply scores nothing', () => {
  const { state, clock, act, view, ctx } = table(['a', 'b', 'c', 'd'], { clueSeconds: 40, guessSeconds: 30 });
  const [c0, c1] = state.cipherIds;
  const g0 = state.teams[0].find((id) => id !== c0)!;
  const g1 = state.teams[1].find((id) => id !== c1)!;
  act(c0, { type: 'clue', text: 'molten' });

  clock.now += 41_000;
  assert.ok(codeWords.tick!(state, ctx()));
  assert.equal(state.phase, 'guess');
  assert.deepEqual(view(g1).clues, ['molten', null]);

  // An unlocked pick still counts when time runs out.
  act(g1, { type: 'pick', slot: 'intercept', wordIndex: state.targets[0] });
  act(g0, { type: 'pick', slot: 'crack', wordIndex: state.targets[0] });
  clock.now += 31_000;
  assert.ok(codeWords.tick!(state, ctx()));
  assert.equal(state.phase, 'reveal');
  assert.deepEqual(state.scores, [2, 1]);
  assert.deepEqual(view(g0).result!.cracked, [true, false], 'team 1 never had a clue to read');

  clock.now += 21_000;
  assert.ok(codeWords.tick!(state, ctx()));
  assert.equal(state.round, 1);
  assert.equal(state.phase, 'clue');
});

test('the cipher rotates, skips anyone who has dropped, and is off the chat mid-round', () => {
  const { state, away, act, clueUp } = table(['a', 'b', 'c', 'd', 'e', 'f']);
  const first = state.cipherIds[0];
  assert.equal(codeWords.filterChat!(state, first, 'psst'), 'Ciphers stay off the air until the reveal.');
  assert.equal(codeWords.filterChat!(state, state.teams[0].find((id) => id !== first)!, 'hi'), null);

  clueUp();
  for (const id of [...state.teams[0], ...state.teams[1]].filter((id) => !state.cipherIds.includes(id))) act(id, { type: 'lock' });
  act(state.teams[0][0], { type: 'next', round: 0 });
  const second = state.cipherIds[0];
  assert.notEqual(second, first);
  assert.equal(codeWords.filterChat!(state, first, 'hi'), null, 'last round’s cipher is free to talk again');

  away.add(state.teams[0][(state.teams[0].indexOf(second) + 1) % 3]);
  clueUp();
  for (const id of [...state.teams[0], ...state.teams[1]].filter((id) => !state.cipherIds.includes(id) && !away.has(id))) {
    act(id, { type: 'lock' });
  }
  assert.equal(state.phase, 'reveal', 'a missing guesser does not hold up the round');
  act(state.teams[0][0], { type: 'next', round: 1 });
  assert.ok(!away.has(state.cipherIds[0]), 'the cipher seat skips past them');
});

test('the game ends after the last round and names a winner', () => {
  const { state, said, act, view, clueUp, ctx } = table(['a', 'b', 'c', 'd'], { rounds: 2 });
  const play = (crackIt: boolean) => {
    const [c0, c1] = state.cipherIds;
    const g0 = state.teams[0].find((id) => id !== c0)!;
    const g1 = state.teams[1].find((id) => id !== c1)!;
    clueUp();
    if (crackIt) act(g0, { type: 'pick', slot: 'crack', wordIndex: state.targets[0] });
    act(g0, { type: 'lock' });
    act(g1, { type: 'lock' });
    act(g0, { type: 'next', round: state.round });
  };
  play(true);
  assert.equal(state.round, 1);
  play(false);

  assert.ok(codeWords.isFinished(state));
  assert.equal(view('a').winner, 0);
  assert.deepEqual(state.scores, [2, 0]);
  assert.match(said.at(-1)!, /Final score 2–0/);
  assert.equal(codeWords.addPlayer!(state, seat(['z'])[0], ctx()), false);
  assert.equal(view('a').result!.round, 1, 'the last round stays on screen');
});

test('four players are needed, teams are balanced, and latecomers fill the smaller side', () => {
  assert.match(codeWords.validateStart!(seat(['a', 'b', 'c']), {}) as string, /at least 4 players/);
  assert.equal(codeWords.validateStart!(seat(['a', 'b', 'c', 'd']), {}), null);

  const lopsided: PlayerInfo[] = seat(['a', 'b', 'c', 'd', 'e']).map((p) => ({ ...p, team: 0 }));
  const ctx = (): GameContext => ({ now: 1, random: Math.random, announce: () => {}, isConnected: () => true });
  const state = codeWords.setup(lopsided, {}, ctx());
  assert.ok(state.teams[0].length >= 2 && state.teams[1].length >= 2, 'nobody is left without a guesser');
  assert.equal(state.teams[0].length + state.teams[1].length, 5);

  const small = state.teams[0].length <= state.teams[1].length ? 0 : 1;
  assert.deepEqual(codeWords.addPlayer!(state, seat(['f'])[0], ctx()), { team: small });
  assert.equal(codeWords.view(state, 'f').role, 'guesser');
});
