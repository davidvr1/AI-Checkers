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
 * Men capture FORWARD ONLY -- the two forward diagonals, jumping one adjacent
 * enemy piece into the empty square beyond. This is a deliberate house rule
 * (American/English draughts style), chosen by the user on 2026-07-23 in
 * preference to the he.wikibooks Israeli-draughts page, which permits backward
 * captures; see the Spec Change Log. (Men's simple moves were already forward
 * only, so a man never moves backward at all now, capturing or not.)
 *
 * Kings are "flying kings": along a clear diagonal, a king may jump the first
 * enemy piece it meets and land on *any* empty square beyond it (up to the next
 * occupied square or the edge) -- so one capturing king position can have
 * several landing options for the same captured piece. Kings are unaffected by
 * the forward-only rule; they capture in all four diagonal directions.
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

  const forward = forwardRow(player);
  const moves: Move[] = [];
  for (const dir of [{ row: forward, col: -1 }, { row: forward, col: 1 }]) {
    const mid = step(pos, dir);
    const to = step(pos, dir, 2);
    if (!isOnBoard(to)) continue;
    const midPiece = getPiece(board, mid);
    if (!midPiece || midPiece.color === player || getPiece(board, to) !== null) continue;
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
 * True for the one unambiguously drawn material configuration: exactly one king
 * per side and nothing else. Two lone flying kings cannot force a capture on each
 * other, so the game can only continue indefinitely. Deliberately narrow -- it
 * recognizes ONLY this minimal case, never guessing at richer multi-piece
 * endgames that might or might not be winnable. Requiring one king per *side*
 * (not merely two kings total) matters: two same-color kings is a decisive
 * position, not a draw, and must never be classified here.
 *
 * The caller must still gate this on the side to move having no immediate capture
 * -- reducing TO one-king-each via a capture leaves the mover a possible winning
 * jump of the last enemy king, which is a win, not a draw.
 */
export function isInsufficientMaterial(board: Board): boolean {
  let red = 0;
  let black = 0;
  for (const row of board) {
    for (const square of row) {
      if (!square) continue;
      if (square.kind !== 'king') return false;
      if (square.color === 'red') red++;
      else black++;
      if (red > 1 || black > 1) return false;
    }
  }
  return red === 1 && black === 1;
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
