import type { Board, MoveLogEntry, Piece, PieceColor, Position, Square } from './types';

export const BOARD_SIZE = 8;

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<Square>(BOARD_SIZE).fill(null));
}

/**
 * Standard 8x8 draughts starting position (shared by American/English and
 * Israeli/international rules): 12 men per side on the dark squares of the three
 * rows closest to each player. Black occupies rows 0-2, red occupies rows 5-7,
 * matching the approved board sketch.
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

/**
 * A compact string uniquely identifying a board layout plus whose turn it is --
 * two states are "the same position" for repetition purposes iff their keys match.
 * Deliberately cheap (no JSON.stringify): called on every real turn-pass, including
 * from inside the AI's search on hypothetical future positions.
 */
export function positionKey(board: Board, player: PieceColor): string {
  let key = player === 'red' ? 'R' : 'B';
  for (const row of board) {
    for (const square of row) {
      key += square ? (square.color === 'red' ? 'r' : 'b') + (square.kind === 'king' ? 'K' : 'm') : '.';
    }
  }
  return key;
}

/**
 * The origin and final-landing squares of the most recent turn, for highlighting
 * "what just happened" -- especially useful in online play, where you see the
 * board change without watching the opponent move. Returns the `from` of the
 * turn's first leg and the `to` of its last leg, so a multi-jump reads as one
 * origin -> final-square hop rather than only its last leg. Null before any move.
 */
export function lastTurnSquares(history: MoveLogEntry[]): { from: Position; to: Position } | null {
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  // Walk back over the trailing run of same-player entries (the legs of one
  // multi-jump turn); turns otherwise alternate players, so this stops at the
  // turn boundary.
  let first = history.length - 1;
  while (first > 0 && history[first - 1].player === last.player) first--;
  return { from: history[first].from, to: last.to };
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
