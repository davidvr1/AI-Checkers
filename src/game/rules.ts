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

function step(pos: Position, dir: Direction, scale = 1): Position {
  return { row: pos.row + dir.row * scale, col: pos.col + dir.col * scale };
}

/**
 * Walks `dir` starting one square beyond `from` (not including `from` itself),
 * collecting consecutive empty squares until the board edge or an occupied
 * square is reached. `blocker` is that occupied square, or null at the edge.
 */
function scanRay(board: Board, from: Position, dir: Direction): { empties: Position[]; blocker: Position | null } {
  const empties: Position[] = [];
  let pos = step(from, dir);
  while (isOnBoard(pos) && getPiece(board, pos) === null) {
    empties.push(pos);
    pos = step(pos, dir);
  }
  return { empties, blocker: isOnBoard(pos) ? pos : null };
}

/**
 * Non-capturing moves for the piece at `pos`. Men step exactly one square
 * diagonally forward. Kings are "flying kings" (Israeli/international draughts
 * house rule): they slide any distance in any of the 4 diagonal directions,
 * stopping at the board edge or the first occupied square.
 */
export function pieceSimpleMoves(board: Board, pos: Position): Move[] {
  const piece = getPiece(board, pos);
  if (!piece) return [];

  if (piece.kind === 'king') {
    return ALL_DIRECTIONS.flatMap((dir) => scanRay(board, pos, dir).empties.map((to) => ({ from: pos, to })));
  }

  const forward = forwardRow(piece.color);
  const moves: Move[] = [];
  for (const dir of [{ row: forward, col: -1 }, { row: forward, col: 1 }]) {
    const to = step(pos, dir);
    if (isOnBoard(to) && getPiece(board, to) === null) {
      moves.push({ from: pos, to });
    }
  }
  return moves;
}

/**
 * Single-jump capture moves for the piece at `pos`, belonging to `player`.
 *
 * Men may capture in any diagonal direction (including backward) by jumping one
 * adjacent enemy piece -- except a man may only capture an enemy KING by jumping
 * forward; capturing an enemy man is unrestricted (house rule: "a man can indeed
 * capture a king, but only advancing").
 *
 * Kings are "flying kings": along a clear diagonal, a king may jump the first
 * enemy piece it meets and land on *any* empty square beyond it (up to the next
 * occupied square or the edge) -- so one capturing king position can have
 * several landing options for the same captured piece.
 */
export function pieceCaptureMoves(board: Board, pos: Position, player: PieceColor): Move[] {
  const piece = getPiece(board, pos);
  if (!piece || piece.color !== player) return [];

  if (piece.kind === 'king') {
    const moves: Move[] = [];
    for (const dir of ALL_DIRECTIONS) {
      const { blocker } = scanRay(board, pos, dir);
      if (!blocker) continue;
      const blockerPiece = getPiece(board, blocker);
      if (!blockerPiece || blockerPiece.color === player) continue;
      for (const to of scanRay(board, blocker, dir).empties) {
        moves.push({ from: pos, to, captured: blocker });
      }
    }
    return moves;
  }

  const moves: Move[] = [];
  for (const dir of ALL_DIRECTIONS) {
    const mid = step(pos, dir);
    const to = step(pos, dir, 2);
    if (!isOnBoard(to)) continue;
    const midPiece = getPiece(board, mid);
    if (!midPiece || midPiece.color === player || getPiece(board, to) !== null) continue;
    if (midPiece.kind === 'king' && dir.row !== forwardRow(player)) continue;
    moves.push({ from: pos, to, captured: mid });
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
 * True when neither side has enough material left to force a win -- currently
 * just the unambiguous minimal case, one flying king per side and nothing else,
 * which can shuffle forever without either side ever being forced into a capture.
 * Deliberately conservative: it never misjudges a position that could still be
 * won as a draw, at the cost of not catching every drawn-but-technically-winnable
 * king endgame.
 */
export function isInsufficientMaterial(board: Board): boolean {
  let total = 0;
  for (const row of board) {
    for (const square of row) {
      if (!square) continue;
      if (square.kind !== 'king') return false;
      total++;
      if (total > 2) return false;
    }
  }
  return total === 2;
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
