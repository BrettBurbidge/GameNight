import { COLS, ROWS, type Cell } from './types';

export const emptyBoard = (): Cell[] => Array(COLS * ROWS).fill(-1);

/** The row a disc dropped in `col` lands on, or -1 if the column is full. */
export function landingRow(board: Cell[], col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) if (board[row * COLS + col] === -1) return row;
  return -1;
}

export function legalCols(board: Cell[]): number[] {
  return Array.from({ length: COLS }, (_, c) => c).filter((c) => board[c] === -1);
}

/** Every line of four cells on the board, precomputed. */
export const WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
        if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) out.push(cells.map(([rr, cc]) => rr * COLS + cc));
      }
    }
  }
  return out;
})();

/** The winning line through `cell` (just played), if any. Returns all connected cells when it's longer than four. */
export function winningLine(board: Cell[], cell: number): number[] | null {
  const who = board[cell];
  if (who === -1) return null;
  const r0 = Math.floor(cell / COLS);
  const c0 = cell % COLS;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line = [cell];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === who) {
        line.push(r * COLS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}
