import { landingRow, legalCols, WINDOWS, winningLine } from './board';
import { COLS, type Cell } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard';

const DEPTH: Record<Difficulty, number> = { easy: 2, medium: 4, hard: 7 };
/** Easy bots sometimes just play a random column. */
const BLUNDER: Record<Difficulty, number> = { easy: 0.35, medium: 0.05, hard: 0 };
const WIN = 1_000_000;
// Search centre columns first: better moves early means more alpha-beta cut-offs.
const ORDER = [3, 2, 4, 1, 5, 0, 6];

function scoreWindow(board: Cell[], cells: number[], me: 0 | 1): number {
  let mine = 0;
  let theirs = 0;
  for (const i of cells) {
    if (board[i] === me) mine++;
    else if (board[i] !== -1) theirs++;
  }
  if (mine && theirs) return 0;
  if (mine === 3) return 50;
  if (mine === 2) return 8;
  if (theirs === 3) return -60;
  if (theirs === 2) return -8;
  return 0;
}

function evaluate(board: Cell[], me: 0 | 1): number {
  let score = 0;
  for (let r = 0; r < board.length / COLS; r++) if (board[r * COLS + 3] === me) score += 6;
  for (const w of WINDOWS) score += scoreWindow(board, w, me);
  return score;
}

/** Negamax with alpha-beta. Returns a score from the point of view of the player to move. */
function search(board: Cell[], depth: number, alpha: number, beta: number, toMove: 0 | 1): number {
  const cols = ORDER.filter((c) => board[c] === -1);
  if (!cols.length) return 0;
  if (depth === 0) return evaluate(board, toMove);
  let best = -Infinity;
  for (const col of cols) {
    const cell = landingRow(board, col) * COLS + col;
    board[cell] = toMove;
    const score = winningLine(board, cell) ? WIN + depth : -search(board, depth - 1, -beta, -alpha, toMove === 0 ? 1 : 0);
    board[cell] = -1;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseBotMove(board: Cell[], me: 0 | 1, difficulty: Difficulty, random: () => number): number {
  const legal = legalCols(board);
  if (legal.length === 1) return legal[0];
  if (random() < BLUNDER[difficulty]) return legal[Math.floor(random() * legal.length)];

  const scratch = [...board];
  let bestScore = -Infinity;
  let best: number[] = [];
  for (const col of ORDER.filter((c) => legal.includes(c))) {
    const cell = landingRow(scratch, col) * COLS + col;
    scratch[cell] = me;
    const score = winningLine(scratch, cell) ? WIN * 2 : -search(scratch, DEPTH[difficulty] - 1, -Infinity, Infinity, me === 0 ? 1 : 0);
    scratch[cell] = -1;
    if (score > bestScore) {
      bestScore = score;
      best = [col];
    } else if (score === bestScore) {
      best.push(col);
    }
  }
  return best[Math.floor(random() * best.length)];
}
