import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { choosePicks, roll, type ClueRequest, type GuessRequest } from './bot';
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

// ---------- bots ----------

/** A table where some seats are bots, with a stand-in for the brain: `thoughts` is what it has answered so far. */
function botTable(ids: string[], bots: string[], config: Record<string, string | number> = {}) {
  const clock = { now: 1000 };
  const thoughts = new Map<string, unknown>();
  const ctx = (): GameContext => ({
    now: clock.now,
    random: Math.random,
    announce: () => {},
    isConnected: () => true,
    isBot: (id) => bots.includes(id),
    thought: (key) => thoughts.get(key),
  });
  const state = codeWords.setup(seat(ids), config, ctx());
  const act = (id: string, action: CodeWordsAction) => codeWords.action(state, id, action, ctx());
  const bot = (id: string) => codeWords.bot!(state, id, ctx());
  /** Lets every bot that is ready make one move. Returns how many did. */
  const botsMove = () => {
    let moved = 0;
    for (const id of bots) {
      const action = bot(id);
      if (!action) continue;
      assert.equal(act(id, action), undefined, `${id} made a legal move`);
      moved++;
    }
    return moved;
  };
  return { state, clock, thoughts, ctx, act, bot, botsMove };
}

test('a seat can change hands mid-round without losing its place', () => {
  const { state, act, view, clueUp } = table(['a', 'b', 'c', 'd', 'e', 'f']);
  const cipher = state.cipherIds[0];
  const [g1, g2] = state.teams[0].filter((id) => id !== cipher);
  clueUp();
  act(g1, { type: 'pick', slot: 'crack', wordIndex: state.targets[0] });
  act(g1, { type: 'lock' });

  codeWords.swapPlayer!(state, g1, 'bot_1');
  codeWords.swapPlayer!(state, cipher, 'bot_2');
  assert.ok(state.teams[0].includes('bot_1') && state.teams[0].includes('bot_2'));
  assert.ok(!state.teams[0].includes(g1) && !state.teams[0].includes(cipher));
  assert.equal(state.cipherIds[0], 'bot_2');
  assert.equal(view('bot_2').role, 'cipher');
  assert.equal(view('bot_1').myPicks.crack, state.targets[0], 'the picks come along');
  assert.ok(state.locked.includes('bot_1') && !state.locked.includes(g1), 'and so does the lock');
  assert.equal(view(g1).role, 'spectator');
  assert.deepEqual(view(g2).tally.crack, { [state.targets[0]]: 1 });
});

test('a bot is only told what its seat can see', () => {
  const { state, act } = botTable(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'b', 'c', 'd', 'e', 'f']);
  const [c0, c1] = state.cipherIds;
  const [g0a, g0b] = state.teams[0].filter((id) => id !== c0);
  const [word0, word1] = [state.board[state.targets[0]], state.board[state.targets[1]]];

  const clueTask = codeWords.botTask!(state, c0)!;
  const clueReq = clueTask.request as ClueRequest;
  assert.equal(clueReq.target, word0);
  assert.ok(clueReq.words.includes(word1), 'the other target is just another word on the table');
  assert.ok(!JSON.stringify({ ...clueReq, words: [] }).includes(word1), 'and is not marked out in any way');
  assert.notEqual(codeWords.botTask!(state, c1)!.key, clueTask.key);
  assert.equal(codeWords.botTask!(state, g0a), null, 'guessers have nothing to think about yet');

  act(c0, { type: 'clue', text: 'first hint' });
  assert.equal(codeWords.botTask!(state, c0), null, 'a sent clue needs no more thought');
  act(c1, { type: 'clue', text: 'second hint' });

  const guessTask = codeWords.botTask!(state, g0a)!;
  const guessReq = guessTask.request as GuessRequest;
  assert.deepEqual([guessReq.ownClue, guessReq.theirClue], ['first hint', 'second hint']);
  assert.equal(guessReq.words.length, BOARD_SIZE);
  assert.deepEqual(Object.keys(guessReq).sort(), ['kind', 'ownClue', 'theirClue', 'words'], 'no targets ride along');
  assert.equal(codeWords.botTask!(state, g0b)!.key, guessTask.key, 'teammates share one reading');
  const otherGuesser = state.teams[1].find((id) => id !== c1)!;
  assert.notEqual(codeWords.botTask!(state, otherGuesser)!.key, guessTask.key, 'the other team gets its own');
  assert.equal(codeWords.botTask!(state, c0), null, 'ciphers sit the guessing out');
  assert.equal(codeWords.botTask!(state, 'watcher'), null);
});

test('a cipher bot waits a moment, skips clues the rules reject, and stays quiet with nothing to say', () => {
  const { state, clock, thoughts, bot } = botTable(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']);
  const [c0, c1] = state.cipherIds;
  const key0 = codeWords.botTask!(state, c0)!.key;
  const key1 = codeWords.botTask!(state, c1)!.key;

  clock.now += 60_000;
  assert.equal(bot(c0), null, 'no answer from the brain yet');
  thoughts.set(key0, { clues: [state.board[3].toLowerCase(), 'one two three', 'row 4', '  Fine   clue '] });
  thoughts.set(key1, null);
  assert.deepEqual(bot(c0), { type: 'clue', text: 'Fine clue' });
  assert.equal(bot(c1), null, 'a failed thought means no clue');
  thoughts.set(key1, { clues: ['way too many words'] });
  assert.equal(bot(c1), null, 'and so does a thought with nothing usable');

  clock.now -= 59_000;
  assert.equal(bot(c0), null, 'one second in is too soon to have written a clue');
});

test('a guesser bot picks, then holds the round open for a human teammate', () => {
  // Seats are shuffled at setup, so choose the bot afterwards: one guesser on team 0, with a human beside it.
  const bots: string[] = [];
  const { state, clock, thoughts, act, bot } = botTable(['a', 'b', 'c', 'd', 'e', 'f'], bots);
  const [c0, c1] = state.cipherIds;
  const [botId, human] = state.teams[0].filter((id) => id !== c0);
  bots.push(botId);
  const ask = () => bot(botId);

  act(c0, { type: 'clue', text: 'first hint' });
  act(c1, { type: 'clue', text: 'second hint' });
  const [t0, t1] = state.targets;
  thoughts.set(codeWords.botTask!(state, botId)!.key, { own: [t0, 99, -1], theirs: [t0, t1] });

  assert.equal(ask(), null, 'not the instant the clues land');
  clock.now += 30_000;
  const first = ask()!;
  assert.deepEqual(first, { type: 'pick', slot: 'crack', wordIndex: t0 });
  act(botId, first);
  const second = ask()!;
  assert.deepEqual(second, { type: 'pick', slot: 'intercept', wordIndex: t1 }, 'never the same word twice');
  act(botId, second);
  assert.equal(ask(), null, 'a human teammate is still deciding');
  act(human, { type: 'lock' });
  assert.deepEqual(ask(), { type: 'lock' });
});

test('skill decides how closely a bot follows the reading', () => {
  const thought = { own: [1, 2, 3], theirs: [4, 5, 6] };
  const picks = (skill: 'easy' | 'standard' | 'sharp') =>
    Array.from({ length: 400 }, (_, i) => choosePicks(thought, skill, () => true, (salt) => roll(`bot_${i}:${salt}`)));
  const share = (list: { crack: number | null; intercept: number | null }[], test: (p: (typeof list)[number]) => boolean) =>
    list.filter(test).length / list.length;

  const sharp = picks('sharp');
  assert.equal(share(sharp, (p) => p.crack === 1 && p.intercept === 4), 1, 'sharp bots always take the top reading');
  const standard = picks('standard');
  const easy = picks('easy');
  assert.ok(share(standard, (p) => p.crack === 1) > 0.75);
  assert.ok(share(easy, (p) => p.crack === 1) < 0.7 && share(easy, (p) => p.crack === 1) > 0.4);
  assert.ok(share(easy, (p) => p.intercept === null) > 0.35, 'easy bots often leave the other team alone');
  assert.ok(share(easy, (p) => p.intercept === 4) < share(standard, (p) => p.intercept === 4));

  assert.deepEqual(choosePicks(null, 'sharp', () => true, () => 0.5), { crack: null, intercept: null }, 'no reading, no picks');
  assert.deepEqual(choosePicks({ own: [7], theirs: [7] }, 'sharp', () => true, () => 0.5), { crack: 7, intercept: null });
  assert.deepEqual(choosePicks({ own: [7, 8], theirs: [9] }, 'sharp', (i) => i !== 7, () => 0.5), { crack: 8, intercept: 9 }, 'spent words are skipped');
});

test('four sharp bots with a perfect brain play a whole game by themselves', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const { state, clock, thoughts, ctx, botsMove } = botTable(ids, ids, { rounds: 4, botSkill: 'sharp' });
  assert.equal(state.botSkill, 'sharp');

  for (let step = 0; step < 4000 && !codeWords.isFinished(state); step++) {
    // The stand-in brain answers every open task straight away, and always correctly.
    for (const id of ids) {
      const task = codeWords.botTask!(state, id);
      if (!task || thoughts.has(task.key)) continue;
      const team = state.teams[0].includes(id) ? 0 : 1;
      thoughts.set(task.key, (task.request as ClueRequest).kind === 'clue' ? { clues: [`hint ${'abcdefgh'[state.round]}`] } : { own: [state.targets[team]], theirs: [state.targets[1 - team]] });
    }
    if (!botsMove()) {
      clock.now += 250;
      codeWords.tick!(state, ctx());
    }
  }

  assert.ok(codeWords.isFinished(state), 'the game reached its end');
  assert.deepEqual(state.scores, [12, 12], 'every clue cracked and intercepted, four rounds running');
  assert.ok(clock.now < 1000 + 4 * 60_000, 'and nobody waited on a timer except the reveal');
});

test('the bot skill setting falls back to standard', () => {
  assert.equal(botTable(['a', 'b', 'c', 'd'], []).state.botSkill, 'standard');
  assert.equal(botTable(['a', 'b', 'c', 'd'], [], { botSkill: 'genius' }).state.botSkill, 'standard');
  assert.equal(botTable(['a', 'b', 'c', 'd'], [], { botSkill: 'easy' }).state.botSkill, 'easy');
});
