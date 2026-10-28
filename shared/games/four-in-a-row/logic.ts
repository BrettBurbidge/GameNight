import type { GameContext, GameDefinition } from '../../game';
import type { PlayerId } from '../../types';
import { emptyBoard, landingRow, winningLine } from './board';
import { chooseBotMove, type Difficulty } from './bot';
import { COLS, type Cell, type FourAction, type FourView } from './types';

interface FourState {
  seats: [PlayerId, PlayerId];
  board: Cell[];
  turn: 0 | 1;
  phase: FourView['phase'];
  lastMove: FourView['lastMove'];
  moveSeq: number;
  winLine: number[] | null;
  winner: FourView['winner'];
  wins: [number, number];
  draws: number;
  gameNumber: number;
  bestOf: number;
  firstPlayer: 0 | 1;
  nextGameAt: number | null;
  gameSeq: number;
  difficulty: Difficulty;
}

export const NEXT_GAME_MS = 4000;

function newGame(state: FourState) {
  state.board = emptyBoard();
  state.turn = state.firstPlayer;
  state.phase = 'playing';
  state.lastMove = null;
  state.winLine = null;
  state.winner = null;
  state.nextGameAt = null;
  state.gameSeq++;
}

export function matchWinner(state: Pick<FourState, 'wins' | 'bestOf' | 'gameNumber'>): FourView['matchWinner'] {
  const target = Math.floor(state.bestOf / 2) + 1;
  if (state.wins[0] >= target) return 0;
  if (state.wins[1] >= target) return 1;
  if (state.gameNumber >= state.bestOf) return state.wins[0] === state.wins[1] ? 'draw' : state.wins[0] > state.wins[1] ? 0 : 1;
  return null;
}

function endGame(state: FourState, winner: 0 | 1 | 'draw', ctx: GameContext) {
  state.winner = winner;
  if (winner === 'draw') state.draws++;
  else state.wins[winner]++;
  if (matchWinner(state) !== null) {
    state.phase = 'match-over';
    state.nextGameAt = null;
  } else {
    state.phase = 'game-over';
    state.nextGameAt = ctx.now + NEXT_GAME_MS;
  }
}

export const fourInARow: GameDefinition<FourState, FourAction, FourView> = {
  id: 'four-in-a-row',

  validateStart(players) {
    return players.filter((p) => !p.spectator).length === 2 ? null : 'Four in a Row needs exactly 2 players.';
  },

  setup(players, config, ctx) {
    const seated = players.filter((p) => !p.spectator).slice(0, 2);
    // Humans get red (first move in game one) over bots.
    seated.sort((a, b) => Number(a.isBot) - Number(b.isBot) || (ctx.random() < 0.5 ? -1 : 1));
    const state: FourState = {
      seats: [seated[0].id, seated[1].id],
      board: emptyBoard(),
      turn: 0,
      phase: 'playing',
      lastMove: null,
      moveSeq: 0,
      winLine: null,
      winner: null,
      wins: [0, 0],
      draws: 0,
      gameNumber: 1,
      bestOf: Number(config.bestOf ?? 3),
      firstPlayer: 0,
      nextGameAt: null,
      gameSeq: 0,
      difficulty: (['easy', 'medium', 'hard'].includes(String(config.difficulty)) ? config.difficulty : 'medium') as Difficulty,
    };
    newGame(state);
    return state;
  },

  action(state, playerId, action, ctx) {
    if (action.type !== 'drop') return 'Unknown action.';
    const seat = state.seats.indexOf(playerId);
    if (seat === -1) return 'You’re watching this game.';
    if (state.phase !== 'playing') return 'This game is over.';
    if (seat !== state.turn) return 'It’s not your turn.';
    const col = action.col;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return 'Pick a column.';
    const row = landingRow(state.board, col);
    if (row === -1) return 'That column is full.';

    const cell = row * COLS + col;
    state.board[cell] = seat as 0 | 1;
    state.lastMove = { cell, seq: ++state.moveSeq };
    const line = winningLine(state.board, cell);
    if (line) {
      state.winLine = line;
      endGame(state, seat as 0 | 1, ctx);
    } else if (state.board.every((c) => c !== -1)) {
      endGame(state, 'draw', ctx);
    } else {
      state.turn = state.turn === 0 ? 1 : 0;
    }
  },

  tick(state, ctx) {
    if (state.phase === 'game-over' && state.nextGameAt !== null && ctx.now >= state.nextGameAt) {
      state.gameNumber++;
      state.firstPlayer = state.firstPlayer === 0 ? 1 : 0;
      newGame(state);
      return true;
    }
    return false;
  },

  bot(state, botId, ctx) {
    const seat = state.seats.indexOf(botId);
    if (state.phase !== 'playing' || seat !== state.turn) return null;
    return { type: 'drop', col: chooseBotMove(state.board, seat as 0 | 1, state.difficulty, ctx.random) };
  },

  botDelay: () => 700,

  swapPlayer(state, from, to) {
    state.seats = state.seats.map((id) => (id === from ? to : id)) as [PlayerId, PlayerId];
  },

  addPlayer: () => false,

  view(state, viewerId) {
    const you = state.seats.indexOf(viewerId) as -1 | 0 | 1;
    return {
      phase: state.phase,
      seats: state.seats,
      you,
      board: state.board,
      turn: state.turn,
      lastMove: state.lastMove,
      winLine: state.winLine,
      winner: state.winner,
      wins: state.wins,
      draws: state.draws,
      gameNumber: state.gameNumber,
      bestOf: state.bestOf,
      nextGameAt: state.nextGameAt,
      matchWinner: state.phase === 'match-over' ? matchWinner(state) : null,
      gameSeq: state.gameSeq,
    };
  },

  isFinished: (state) => state.phase === 'match-over',
};
