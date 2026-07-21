import { applyMove, currentLegalMoves } from '../game/gameReducer';
import type { Difficulty, GameState, Move, PieceColor } from '../game/types';
import { evaluate } from './evaluate';

/**
 * Search depth per difficulty. One ply is charged each time a move actually
 * hands the turn to the other side; a multi-jump chain within one player's own
 * turn costs zero additional plies (see the same-ply recursion note below).
 *
 * Benchmarked with a throwaway script against three positions: the initial
 * board (7 legal moves), a random 14-ply midgame (7-9 legal moves), and a
 * deliberately worst-case "many kings, wide open board" position (21 legal
 * moves -- kings move in all 4 directions, so this is close to the ceiling on
 * branching factor). Observed worst-case timings on the many-kings position:
 * depth 5 ~30ms, depth 6 ~90ms, depth 7 ~580ms, depth 8 ~910ms (beyond which the
 * 200k-node cap plateaus it). Hard is set to 7 for a comfortable margin under
 * the 2-second target even on hardware slower than the benchmarking machine.
 * `SEARCH_DEADLINE_MS` below is the actual enforcement of that target -- these
 * depths are just tuned so the deadline is rarely, if ever, the limiting factor.
 */
export const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  easy: 2,
  medium: 5,
  hard: 7,
};

/** Safety net against a pathologically branchy position: stop exploring and return
 * the best move found so far rather than hang. Approximate, not exact -- a single
 * in-flight recursive call can overshoot this before it next gets checked. */
const MAX_NODES = 200_000;

/**
 * Wall-clock safety net independent of MAX_NODES: node count correlates with time
 * but doesn't bound it (a slower machine or a pathological branch can blow the
 * "well under 2 seconds" target even under the node cap). Checked at the top of
 * every recursive call, so it bounds overshoot from any single in-flight subtree
 * as well as the total.
 */
const SEARCH_DEADLINE_MS = 1500;

interface SearchContext {
  /** The color the search is choosing a move for; evaluate() is always scored from this perspective. */
  aiColor: PieceColor;
  nodes: number;
  deadline: number;
}

function budgetExceeded(ctx: SearchContext): boolean {
  return ctx.nodes >= MAX_NODES || performance.now() >= ctx.deadline;
}

/**
 * True when applying `move` to `state` leaves the *same* player still mid-turn --
 * i.e. it was a capture with a further-capture choice (`mustContinueFrom` stays
 * set), not a move that hands the turn to the opponent.
 *
 * This is the one subtlety of the whole search: a full turn is one ply, not one
 * jump. Deliberately checked against the *immediate*, non-auto-played result of
 * `applyMove` -- a bulk-resolved (`withAutoPlay`) result can't be used here, since
 * it may chain through an arbitrary number of real turn-passes (e.g. the opponent
 * being forced into a single reply, which itself may free a further forced reply,
 * and so on). Collapsing all of that into a single depth/side step would corrupt
 * the ply count. Instead, every move -- forced or chosen -- gets its own recursive
 * step below, so a chain of forced single-choice replies naturally decrements
 * depth and flips sides once per real turn-pass, exactly as it should.
 */
function isSamePly(state: GameState, next: GameState): boolean {
  return next.status.type === 'in-progress' && next.currentPlayer === state.currentPlayer;
}

/**
 * Alpha-beta search. `maximizing` is true when it's aiColor's turn to act in this
 * subtree, false when it's the opponent's. Depth only decrements, and the
 * maximizing side only flips, once a move actually passes the turn to the other
 * player (or ends the game) -- see `isSamePly`.
 */
function search(
  state: GameState,
  depth: number,
  maximizing: boolean,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): number {
  ctx.nodes++;

  if (state.status.type !== 'in-progress' || budgetExceeded(ctx)) {
    return evaluate(state, ctx.aiColor);
  }

  // A depth-0 cutoff must not truncate a still-in-progress forced multi-jump --
  // that continuation costs no extra ply (see isSamePly) and evaluating the
  // intermediate board would understate material the chain is guaranteed to add.
  if (depth <= 0 && !state.mustContinueFrom) {
    return evaluate(state, ctx.aiColor);
  }

  const moves = currentLegalMoves(state);
  if (moves.length === 0) {
    return evaluate(state, ctx.aiColor);
  }

  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    const value = isSamePly(state, next)
      ? search(next, depth, maximizing, alpha, beta, ctx)
      : search(next, depth - 1, !maximizing, alpha, beta, ctx);

    if (maximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }

    if (alpha >= beta || budgetExceeded(ctx)) break;
  }

  return best;
}

/**
 * Chooses the best move for `state.currentPlayer` via alpha-beta search to `depth`
 * plies. Only ever called when there is a real choice (currentLegalMoves has more
 * than one option) -- a forced single move/continuation is handled by the existing
 * `withAutoPlay` before the AI is ever consulted.
 */
export function chooseAiMove(state: GameState, depth: number): Move {
  const moves = currentLegalMoves(state);
  if (moves.length === 0) {
    throw new Error('chooseAiMove: no legal moves available for the current player');
  }
  if (moves.length === 1) {
    return moves[0];
  }

  const ctx: SearchContext = {
    aiColor: state.currentPlayer,
    nodes: 0,
    deadline: performance.now() + SEARCH_DEADLINE_MS,
  };
  let alpha = -Infinity;
  const beta = Infinity;

  let bestMove = moves[0];
  let bestValue = -Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    const value = isSamePly(state, next)
      ? search(next, depth, true, alpha, beta, ctx)
      : search(next, depth - 1, false, alpha, beta, ctx);

    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
    if (bestValue > alpha) alpha = bestValue;

    if (budgetExceeded(ctx)) break;
  }

  return bestMove;
}
