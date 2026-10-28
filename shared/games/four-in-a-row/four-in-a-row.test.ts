import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameContext } from '../../game';
import type { PlayerInfo } from '../../types';
import { emptyBoard, landingRow, winningLine } from './board';
import { chooseBotMove, type Difficulty } from './bot';
import { fourInARow, NEXT_GAME_MS } from './logic';
import { COLS, type Cell } from './types';

function seeded(seed: number) {
  return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
}

function play(board: Cell[], moves: [number, 0 | 1][]) {
  for (const [col, who] of moves) board[landingRow(board, col) * COLS + col] = who;
  return board;
}

const human = (id: string, isBot = false): PlayerInfo => ({ id, name: id, avatar: '', color: '', isBot, connected: true, spectator: false, team: null });

test('detects horizontal, vertical and diagonal wins', () => {
  const h = play(emptyBoard(), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.equal(winningLine(h, 5 * COLS + 3)!.length, 4);
  const v = play(emptyBoard(), [[4, 1], [4, 1], [4, 1], [4, 1]]);
  assert.ok(winningLine(v, 2 * COLS + 4));
  // Diagonal /: (5,0) (4,1) (3,2) (2,3)
  const d = play(emptyBoard(), [[0, 0], [1, 1], [1, 0], [2, 1], [2, 1], [2, 0], [3, 1], [3, 1], [3, 1], [3, 0]]);
  assert.deepEqual(winningLine(d, 2 * COLS + 3), [2 * COLS + 3, 3 * COLS + 2, 4 * COLS + 1, 5 * COLS + 0]);
  const none = play(emptyBoard(), [[0, 0], [1, 0], [2, 0], [4, 0]]);
  assert.equal(winningLine(none, 5 * COLS + 4), null);
});

test('bots take a winning move and block an immediate threat', () => {
  for (const level of ['easy', 'medium', 'hard'] as Difficulty[]) {
    if (level === 'easy') continue; // easy bots blunder on purpose
    const win = play(emptyBoard(), [[0, 1], [0, 1], [0, 1], [6, 0], [5, 0]]);
    assert.equal(chooseBotMove(win, 1, level, seeded(3)), 0, `${level} takes the win`);
    const block = play(emptyBoard(), [[0, 0], [1, 0], [2, 0], [6, 1]]);
    assert.equal(chooseBotMove(block, 1, level, seeded(3)), 3, `${level} blocks the three-in-a-row`);
  }
});

test('hard bot thinks quickly enough for a server and beats the easy bot', () => {
  const start = performance.now();
  chooseBotMove(play(emptyBoard(), [[3, 0], [3, 1]]), 0, 'hard', seeded(1));
  const ms = performance.now() - start;
  assert.ok(ms < 1500, `hard move took ${Math.round(ms)}ms`);

  let hardWins = 0;
  for (let g = 0; g < 6; g++) {
    const random = seeded(100 + g);
    const board = emptyBoard();
    const levels: Difficulty[] = g % 2 ? ['easy', 'hard'] : ['hard', 'easy'];
    let turn: 0 | 1 = 0;
    for (let move = 0; move < 42; move++) {
      const col = chooseBotMove(board, turn, levels[turn], random);
      const cell = landingRow(board, col) * COLS + col;
      board[cell] = turn;
      if (winningLine(board, cell)) {
        if (levels[turn] === 'hard') hardWins++;
        break;
      }
      turn = turn === 0 ? 1 : 0;
    }
  }
  assert.ok(hardWins >= 5, `hard won ${hardWins}/6`);
});

test('a best-of-3 match alternates first player and ends at two wins', () => {
  let now = 0;
  const ctx = (): GameContext => ({ now, random: seeded(9), announce: () => {}, isConnected: () => true });
  const state = fourInARow.setup([human('bot_x', true), human('me')], { bestOf: 3, difficulty: 'easy' }, ctx());
  assert.deepEqual(state.seats, ['me', 'bot_x'], 'the human gets red');
  assert.equal(fourInARow.view(state, 'spectator').you, -1);

  const winGame = (winner: string, loser: string) => {
    // Winner stacks column 0; loser alternates columns 5 and 6 so it never lines up four.
    let loserCol = 5;
    const loserMove = () => {
      assert.equal(fourInARow.action(state, loser, { type: 'drop', col: loserCol }, ctx()), undefined);
      loserCol = loserCol === 5 ? 6 : 5;
    };
    if (state.seats[state.turn] !== winner) loserMove();
    for (let i = 0; i < 4 && state.phase === 'playing'; i++) {
      assert.equal(fourInARow.action(state, winner, { type: 'drop', col: 0 }, ctx()), undefined);
      if (state.phase === 'playing') loserMove();
    }
  };

  assert.ok(fourInARow.action(state, 'bot_x', { type: 'drop', col: 3 }, ctx()), 'out-of-turn moves are rejected');
  winGame('me', 'bot_x');
  assert.equal(state.phase, 'game-over');
  assert.deepEqual(state.wins, [1, 0]);
  assert.ok(fourInARow.action(state, 'me', { type: 'drop', col: 3 }, ctx()), 'no moves between games');

  now += NEXT_GAME_MS;
  fourInARow.tick!(state, ctx());
  assert.equal(state.gameNumber, 2);
  assert.equal(state.turn, 1, 'yellow starts game two');
  assert.ok(state.board.every((c) => c === -1));

  winGame('me', 'bot_x');
  assert.equal(state.phase, 'match-over');
  assert.equal(fourInARow.view(state, 'me').matchWinner, 0);
  assert.ok(fourInARow.isFinished(state));
});

test('full columns are rejected and a full board is a draw', () => {
  let now = 0;
  const ctx = (): GameContext => ({ now, random: seeded(2), announce: () => {}, isConnected: () => true });
  const state = fourInARow.setup([human('a'), human('b')], { bestOf: 1 }, ctx());
  // A known drawn fill order: columns in pairs so nobody ever lines up four.
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  for (const col of order) {
    const who = state.seats[state.turn];
    assert.equal(fourInARow.action(state, who, { type: 'drop', col }, ctx()), undefined, `move in col ${col}`);
  }
  assert.equal(state.winner, 'draw');
  assert.equal(state.phase, 'match-over');
  assert.equal(fourInARow.view(state, 'a').matchWinner, 'draw');
});
