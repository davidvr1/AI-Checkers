import { getPiece } from './board';
import type { GameState, Move, MoveLogEntry } from './types';

/**
 * Builds the audit-trail entry for a move that is actually being committed to
 * game state -- a narrated record of what happened and why (e.g. why a piece
 * was removed), for human or automated review after the fact. Pure -- reads
 * `state` (before the move) and `nextState` (after), writes nothing. Must only
 * be called from the reducer's real dispatch paths (never from the AI's
 * internal search, which explores many moves that are never actually played --
 * see gameReducer.ts's `withHistory`).
 *
 * By the time this runs, `move` has already passed through `applyMove` (which
 * throws via `applyMoveToBoard` on a missing mover or an empty/wrong-colored
 * `captured` square), so `move.from`/`move.captured` are guaranteed to resolve.
 * The guards below throw anyway, deliberately not degrading to a wrong-but-
 * silent entry, in case a future caller ever reaches this function without
 * going through `applyMove` first -- an audit trail that quietly mis-describes
 * a move is worse than no audit trail at all.
 */
export function buildLogEntry(state: GameState, move: Move, nextState: GameState): MoveLogEntry {
  const movingPiece = getPiece(state.board, move.from);
  if (!movingPiece) {
    throw new Error(`buildLogEntry: no piece at move.from (${move.from.row},${move.from.col})`);
  }

  let captured: MoveLogEntry['captured'];
  if (move.captured) {
    const capturedPiece = getPiece(state.board, move.captured);
    if (!capturedPiece) {
      throw new Error(
        `buildLogEntry: move claims a capture at (${move.captured.row},${move.captured.col}) but no piece is there`,
      );
    }
    captured = {
      position: move.captured,
      piece: capturedPiece,
      reason: `jumped by ${state.currentPlayer}'s ${movingPiece.kind} moving (${move.from.row},${move.from.col}) -> (${move.to.row},${move.to.col})`,
    };
  }

  const pieceAfter = getPiece(nextState.board, move.to);
  if (!pieceAfter) {
    throw new Error(`buildLogEntry: destination (${move.to.row},${move.to.col}) is empty after the move`);
  }
  const promoted = movingPiece.kind === 'man' && pieceAfter.kind === 'king';

  return {
    index: state.history.length,
    player: state.currentPlayer,
    piece: movingPiece,
    from: move.from,
    to: move.to,
    ...(captured ? { captured } : {}),
    promoted,
    resultingStatus: nextState.status,
  };
}

/** Formats one entry as a single readable line, e.g. for console output. */
export function formatLogEntry(entry: MoveLogEntry): string {
  const parts = [
    `#${entry.index}`,
    `${entry.player} ${entry.piece.kind}`,
    `(${entry.from.row},${entry.from.col}) -> (${entry.to.row},${entry.to.col})`,
  ];
  if (entry.captured) {
    parts.push(
      `removed ${entry.captured.piece.color} ${entry.captured.piece.kind} at (${entry.captured.position.row},${entry.captured.position.col}) -- ${entry.captured.reason}`,
    );
  }
  if (entry.promoted) parts.push('promoted to king');
  parts.push(`status: ${entry.resultingStatus.type}`);
  return parts.join(' | ');
}
