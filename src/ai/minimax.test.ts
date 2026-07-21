import { describe, expect, it } from 'vitest';
import { createEmptyBoard, setPiece } from '../game/board';
import { applyMove, createInitialState, currentLegalMoves, withAutoPlay } from '../game/gameReducer';
import type { Board, GameState, PieceColor, PieceKind, Position } from '../game/types';
import { DIFFICULTY_DEPTH, chooseAiMove } from './minimax';

function place(board: Board, pos: Position, color: PieceColor, kind: PieceKind = 'man'): Board {
  return setPiece(board, pos, { color, kind });
}

function baseState(board: Board, currentPlayer: PieceColor = 'red'): GameState {
  return {
    board,
    currentPlayer,
    selected: null,
    mustContinueFrom: null,
    turnsSinceCapture: 0,
    capturedCount: { red: 0, black: 0 },
    status: { type: 'in-progress' },
  };
}

describe('chooseAiMove: prefers the more materially advantageous capture', () => {
  it('picks the capture that nets more material when several are legal', () => {
    // Standard draughts makes capturing mandatory whenever a capture is available,
    // so a literal "capture vs. non-capture" root choice can never occur -- if any
    // piece can capture, getAllLegalMoves excludes every non-capturing move. The
    // meaningful equivalent this codebase can actually produce is a choice *among*
    // forced captures: here red has two independent single-jump captures on offer,
    // one taking a man (worth 1) and one taking a king (worth 1.5). The AI should
    // prefer the higher-value capture.
    let board = createEmptyBoard();
    board = place(board, { row: 3, col: 0 }, 'red', 'man');
    board = place(board, { row: 2, col: 1 }, 'black', 'man'); // captured landing (1,2)
    board = place(board, { row: 3, col: 6 }, 'red', 'king');
    board = place(board, { row: 2, col: 5 }, 'black', 'king'); // captured landing (1,4)

    const state = baseState(board, 'red');
    const moves = currentLegalMoves(state);
    expect(moves).toHaveLength(2);

    const move = chooseAiMove(state, 2);
    expect(move).toEqual({
      from: { row: 3, col: 6 },
      to: { row: 1, col: 4 },
      captured: { row: 2, col: 5 },
    });
  });
});

describe('chooseAiMove: takes an immediate winning move', () => {
  it('prefers the move that ends the game over harmless alternatives', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 0, col: 1 }, 'black');
    board = place(board, { row: 1, col: 0 }, 'red');
    board = place(board, { row: 1, col: 2 }, 'red'); // has a harmless alternative move
    board = place(board, { row: 2, col: 3 }, 'red'); // has a harmless alternative move
    board = place(board, { row: 7, col: 0 }, 'red'); // the winning move: (6,1)

    const state = baseState(board, 'red');
    const moves = currentLegalMoves(state);
    expect(moves.length).toBeGreaterThan(1);
    expect(moves.every((m) => m.captured === undefined)).toBe(true); // sanity: no mandatory capture in play

    const move = chooseAiMove(state, 2);
    expect(move).toEqual({ from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });
  });
});

describe('chooseAiMove: same-ply multi-jump-choice recursion', () => {
  it('resolves a further-capture choice on the same turn rather than treating it as the opponent replying', () => {
    // Red king at (4,3) has two first-jump options:
    //  A: capture the black KING at (3,2) -> land (2,1), chain ends there (worth +1.5).
    //  B: capture the black MAN at (3,4) -> land (2,5), which leaves a further-capture
    //     *choice* (still red's own turn, not auto-played): either take the man at
    //     (1,4) [worth +1 more] or the king at (1,6) [worth +1.5 more].
    // Correctly resolving B's fork picks the king, so B totals +2.5 -- better than A's
    // +1.5, and the AI should play B's first jump. A naive implementation that flips
    // the maximizing side and decrements depth immediately after *any* jump (instead
    // of only when the turn truly passes) would evaluate B's fork as if the opponent
    // were choosing, or would stop before ever seeing the fork -- either way capping
    // B's value at +1, making A look better and causing the wrong first jump to be
    // chosen.
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 3 }, 'red', 'king');
    board = place(board, { row: 3, col: 2 }, 'black', 'king'); // move A's capture
    board = place(board, { row: 3, col: 4 }, 'black', 'man'); // move B's first capture
    board = place(board, { row: 1, col: 4 }, 'black', 'man'); // B's fork option 1
    board = place(board, { row: 1, col: 6 }, 'black', 'king'); // B's fork option 2 (better)

    const state = baseState(board, 'red');
    const moves = currentLegalMoves(state);
    expect(moves).toHaveLength(2);

    const move = chooseAiMove(state, 1);
    expect(move).toEqual({
      from: { row: 4, col: 3 },
      to: { row: 2, col: 5 },
      captured: { row: 3, col: 4 },
    });
  });
});

describe('chooseAiMove: does not cut off a forced continuation at the depth horizon', () => {
  it('resolves a still-in-progress forced multi-jump before evaluating, even at depth 0', () => {
    // Two independent red pieces, each with exactly one capture available (both
    // captures are mandatory since red has no non-capturing legal moves at all):
    //  P1 (3,0): captures a KING directly (worth 1.5), chain ends there -- true value 1.5.
    //  P2 (3,7): captures a MAN (worth 1), then has exactly one further FORCED
    //    capture (not a fork -- a single continuation) taking a KING (worth 1.5)
    //    -- true value 2.5, strictly better than P1's 1.5.
    // At depth 0, a naive cutoff that ignores an in-progress forced continuation
    // would evaluate P2's branch right after its first jump (value ~1, less than
    // P1's 1.5) and wrongly prefer P1. Resolving the guaranteed continuation
    // first (regardless of depth) correctly ranks P2 above P1.
    let board = createEmptyBoard();
    board = place(board, { row: 3, col: 0 }, 'red', 'man');
    board = place(board, { row: 2, col: 1 }, 'black', 'king');
    board = place(board, { row: 3, col: 7 }, 'red', 'man');
    board = place(board, { row: 2, col: 6 }, 'black', 'man');
    board = place(board, { row: 2, col: 4 }, 'black', 'king');

    const state = baseState(board, 'red');
    const moves = currentLegalMoves(state);
    expect(moves).toHaveLength(2);

    const move = chooseAiMove(state, 0);
    expect(move).toEqual({ from: { row: 3, col: 7 }, to: { row: 1, col: 5 }, captured: { row: 2, col: 6 } });
  });
});

describe('chooseAiMove: respects the configured depth', () => {
  it('returns a legal move for every difficulty without crashing or hanging', () => {
    const state = createInitialState();

    for (const difficulty of Object.keys(DIFFICULTY_DEPTH) as Array<keyof typeof DIFFICULTY_DEPTH>) {
      const depth = DIFFICULTY_DEPTH[difficulty];
      const legalMoves = currentLegalMoves(state);

      const started = performance.now();
      const move = chooseAiMove(state, depth);
      const elapsedMs = performance.now() - started;

      expect(legalMoves).toContainEqual(move);
      // SEARCH_DEADLINE_MS (1500ms) is the enforced bound; allow generous margin
      // for slower CI hardware and the time spent outside the deadline-checked loop.
      expect(elapsedMs).toBeLessThan(3000);
    }
  });

  it('never returns an illegal move across a full self-played game at hard difficulty', () => {
    let state = createInitialState();
    const depth = DIFFICULTY_DEPTH.hard;
    let guard = 0;

    while (state.status.type === 'in-progress' && guard < 200) {
      const legalMoves = currentLegalMoves(state);
      const move = chooseAiMove(state, depth);
      expect(legalMoves).toContainEqual(move);
      // Mirrors the PLAY_MOVE reducer path: applyMove + withAutoPlay.
      state = withAutoPlay(applyMove(state, move));
      guard++;
    }

    expect(guard).toBeLessThan(200); // the game actually terminated
  });
});
