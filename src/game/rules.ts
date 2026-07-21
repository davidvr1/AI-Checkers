import { enumeratePieces, getPiece, isOnBoard, setPiece } from './board';
import type { Board, Move, Piece, PieceColor, Position } from './types';

interface Direction {
  row: number;
  col: number;
}

const ALL_DIRECTIONS: Direction[] = [
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
];

/** Red starts on the high-numbered rows and advances toward row 0; black advances toward row 7. */
function forwardRow(color: PieceColor): number {
  return color === 'red' ? -1 : 1;
}

function directionsFor(piece: Piece): Direction[] {
  if (piece.kind === 'king') return ALL_DIRECTIONS;
  const forward = forwardRow(piece.color);
  return [
    { row: forward, col: -1 },
    { row: forward, col: 1 },
  ];
}

function step(pos: Position, dir: Direction, scale = 1): Position {
  return { row: pos.row + dir.row * scale, col: pos.col + dir.col * scale };
}

/** Non-capturing single-step diagonal moves for the piece at `pos`, if any. */
export function pieceSimpleMoves(board: Board, pos: Position): Move[] {
  const piece = getPiece(board, pos);
  if (!piece) return [];
  const moves: Move[] = [];
  for (const dir of directionsFor(piece)) {
    const to = step(pos, dir);
    if (isOnBoard(to) && getPiece(board, to) === null) {
      moves.push({ from: pos, to });
    }
  }
  return moves;
}

/**
 * Single-jump capture moves for the piece at `pos`, belonging to `player`.
 * Men are forward-only for simple moves, but standard draughts rules let a man
 * capture in any diagonal direction (including backward) -- only kings' simple
 * moves and captures share the same all-directions set.
 */
export function pieceCaptureMoves(board: Board, pos: Position, player: PieceColor): Move[] {
  const piece = getPiece(board, pos);
  if (!piece || piece.color !== player) return [];
  const moves: Move[] = [];
  for (const dir of ALL_DIRECTIONS) {
    const mid = step(pos, dir);
    const to = step(pos, dir, 2);
    if (!isOnBoard(to)) continue;
    const midPiece = getPiece(board, mid);
    if (midPiece && midPiece.color !== player && getPiece(board, to) === null) {
      moves.push({ from: pos, to, captured: mid });
    }
  }
  return moves;
}

/**
 * All legal moves for `player` on `board`, with mandatory-capture enforcement:
 * if any piece can capture, only capture moves (for any/all pieces) are legal.
 */
export function getAllLegalMoves(board: Board, player: PieceColor): Move[] {
  const positions = enumeratePieces(board, player);
  const captureMoves = positions.flatMap((pos) => pieceCaptureMoves(board, pos, player));
  if (captureMoves.length > 0) return captureMoves;
  return positions.flatMap((pos) => pieceSimpleMoves(board, pos));
}

export function hasAnyLegalMove(board: Board, player: PieceColor): boolean {
  return getAllLegalMoves(board, player).length > 0;
}

/**
 * Applies a single move (plain or capturing) to the board, handling capture removal
 * and promotion. Returns a new board; does not mutate the input.
 */
export function applyMoveToBoard(board: Board, move: Move): { board: Board; promoted: boolean } {
  if (!isOnBoard(move.from) || !isOnBoard(move.to)) {
    throw new Error(`applyMoveToBoard: move out of bounds (${JSON.stringify(move)})`);
  }
  const piece = getPiece(board, move.from);
  if (!piece) {
    throw new Error(`applyMoveToBoard: no piece at (${move.from.row}, ${move.from.col})`);
  }
  if (getPiece(board, move.to) !== null) {
    throw new Error(`applyMoveToBoard: destination (${move.to.row}, ${move.to.col}) is occupied`);
  }
  if (move.captured) {
    const capturedPiece = getPiece(board, move.captured);
    if (!capturedPiece || capturedPiece.color === piece.color) {
      throw new Error(`applyMoveToBoard: no opponent piece at captured position (${move.captured.row}, ${move.captured.col})`);
    }
  }

  let next = setPiece(board, move.from, null);
  if (move.captured) {
    next = setPiece(next, move.captured, null);
  }

  const promoted =
    piece.kind === 'man' &&
    ((piece.color === 'red' && move.to.row === 0) || (piece.color === 'black' && move.to.row === 7));

  const finalPiece: Piece = promoted ? { color: piece.color, kind: 'king' } : piece;
  next = setPiece(next, move.to, finalPiece);

  return { board: next, promoted };
}
