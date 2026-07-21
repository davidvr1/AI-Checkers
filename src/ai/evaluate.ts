import type { GameState, PieceColor } from '../game/types';

/** Kings are worth more than men; a reasonable starting weight for v1. */
const KING_WEIGHT = 1.5;
const MAN_WEIGHT = 1;

/** Large enough to dominate any material-only score, but finite so it composes cleanly in minimax. */
const WIN_SCORE = 10_000;

/**
 * Static evaluation of `state` from `color`'s perspective: positive favors `color`.
 * Terminal states score independently of material -- a win/loss swamps any board
 * count, and a draw is exactly neutral. In-progress states score on material alone
 * (men vs. kings), per the spec's "keep it simple for v1" design note.
 */
export function evaluate(state: GameState, color: PieceColor): number {
  if (state.status.type === 'won') {
    return state.status.winner === color ? WIN_SCORE : -WIN_SCORE;
  }
  if (state.status.type === 'draw') {
    return 0;
  }

  const opponent: PieceColor = color === 'red' ? 'black' : 'red';
  let ownWeight = 0;
  let oppWeight = 0;

  for (const row of state.board) {
    for (const square of row) {
      if (!square) continue;
      const weight = square.kind === 'king' ? KING_WEIGHT : MAN_WEIGHT;
      if (square.color === color) ownWeight += weight;
      else if (square.color === opponent) oppWeight += weight;
    }
  }

  return ownWeight - oppWeight;
}
