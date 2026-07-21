import type { Board, Piece, PieceColor, Position, Square } from './types';

export const BOARD_SIZE = 8;

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<Square>(BOARD_SIZE).fill(null));
}

/**
 * Standard American/English draughts starting position: 12 men per side on the
 * dark squares of the three rows closest to each player. Black occupies rows 0-2,
 * red occupies rows 5-7, matching the approved board sketch.
 */
export function createInitialBoard(): Board {
  const board = createEmptyBoard();
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const pos = { row, col };
      if (!isDarkSquare(pos)) continue;
      if (row <= 2) {
        board[row][col] = { color: 'black', kind: 'man' };
      } else if (row >= 5) {
        board[row][col] = { color: 'red', kind: 'man' };
      }
    }
  }
  return board;
}

export function isOnBoard(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

export function isDarkSquare(pos: Position): boolean {
  return (pos.row + pos.col) % 2 === 1;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function getPiece(board: Board, pos: Position): Piece | null {
  return board[pos.row][pos.col];
}

/** Returns a new board with `piece` placed at `pos`, leaving the input board untouched. */
export function setPiece(board: Board, pos: Position, piece: Square): Board {
  const next = board.map((row) => row.slice());
  next[pos.row][pos.col] = piece;
  return next;
}

export function enumeratePieces(board: Board, color: PieceColor): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) positions.push({ row, col });
    }
  }
  return positions;
}
