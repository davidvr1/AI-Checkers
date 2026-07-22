import { applyMove, currentLegalMoves } from '../game/gameReducer';
import type { Difficulty, GameState, Move, PieceColor } from '../game/types';
import { evaluate } from './evaluate';

/**
 * Search depth per difficulty. One ply is charged each time a move actually
 * hands the turn to the other side; a multi-jump chain within one player's own
 * turn costs zero additional plies (see the same-ply recursion note below).
 *
 * Originally benchmarked (throwaway script) against the initial board, a random
 * 14-ply midgame, and a "many kings" position, when kings moved only one step in
 * all 4 directions (~21-move ceiling): depth 5 ~30ms, 6 ~90ms, 7 ~580ms, 8 ~910ms.
 * NOTE (Israeli-draughts ruleset, 2026-07-22): flying kings sharply raise the
 * branching factor -- a single open king now has up to 13 simple destinations and
 * several landing squares per capture -- so those timings no longer hold and the
 * effective depth reached within the deadline is lower in king-heavy positions.
 * These depths were NOT re-benchmarked; `SEARCH_DEADLINE_MS` below is now the real
 * limiter (the search returns best-so-far on timeout), so latency stays bounded
 * but Hard may search fewer plies than 7 in the endgame. Re-tuning is logged in
 * deferred-work.md.
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
 *
 * The search runs synchronously on the main thread (deliberately -- a Web Worker
 * is overkill for a local game), so this value doubles as the worst-case UI-freeze
 * bound: it is kept low enough that the freeze stays sub-second, and that
 * `AI_THINK_DELAY_MS` (400ms in App.tsx) + this + overshoot stays comfortably
 * under the spec's 2-second target.
 */
const SEARCH_DEADLINE_MS = 1000;

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
 * jump. Deliberately checked against the *immediate*, single-step result of
 * `applyMove` -- a hypothetical bulk-resolved result (chaining through every
 * forced reply until a real choice or turn-pass) can't be used here, since it may
 * span an arbitrary number of real turn-passes (e.g. the opponent being forced
 * into a single reply, which itself may free a further forced reply, and so on).
 * Collapsing all of that into a single depth/side step would corrupt the ply
 * count. Instead, every move -- forced or chosen -- gets its own recursive
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
  ply: number,
): number {
  ctx.nodes++;

  // A terminal state has no moves and is always scored as-is.
  if (state.status.type !== 'in-progress') {
    return evaluate(state, ctx.aiColor, ply);
  }

  // Neither the depth horizon nor a budget abort may truncate a still-in-progress
  // forced multi-jump: that continuation costs no extra ply (see isSamePly) and
  // evaluating the intermediate board would understate material the chain is
  // guaranteed to add. A forced chain is finite, so it always resolves before the
  // next cutoff check applies.
  if ((depth <= 0 || budgetExceeded(ctx)) && !state.mustContinueFrom) {
    return evaluate(state, ctx.aiColor, ply);
  }

  const moves = currentLegalMoves(state);
  if (moves.length === 0) {
    return evaluate(state, ctx.aiColor, ply);
  }

  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    // Same-ply (mid-chain) continuation: same turn, so depth/side/ply all hold.
    // A real turn-pass decrements depth, flips the side, and advances the ply.
    const value = isSamePly(state, next)
      ? search(next, depth, maximizing, alpha, beta, ctx, ply)
      : search(next, depth - 1, !maximizing, alpha, beta, ctx, ply + 1);

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
 * plies. Called on every AI turn/continuation, even a forced single move -- there
 * is no silent auto-play; the app always shows a visible "thinking" turn. When
 * there is only one legal option this is a cheap O(1) return, no search needed.
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
    // Root player is aiColor (maximizing). A same-ply continuation stays on ply 0
    // (still the root turn); a real turn-pass hands ply 1 to the opponent.
    const value = isSamePly(state, next)
      ? search(next, depth, true, alpha, beta, ctx, 0)
      : search(next, depth - 1, false, alpha, beta, ctx, 1);

    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
    if (bestValue > alpha) alpha = bestValue;

    if (budgetExceeded(ctx)) break;
  }

  return bestMove;
}
