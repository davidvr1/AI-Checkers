import { describe, expect, it } from 'vitest';
import { createEmptyBoard, createInitialBoard, setPiece } from './board';
import { applyMove, createInitialState, gameReducer, withAutoPlay } from './gameReducer';
import { applyMoveToBoard, getAllLegalMoves, hasAnyLegalMove, pieceCaptureMoves } from './rules';
import type { Board, GameState, Position } from './types';

function place(board: Board, pos: Position, color: 'red' | 'black', kind: 'man' | 'king' = 'man'): Board {
  return setPiece(board, pos, { color, kind });
}

function baseState(board: Board, currentPlayer: 'red' | 'black' = 'red'): GameState {
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

// --- Select movable own piece ---------------------------------------------
describe('select movable own piece', () => {
  it('highlights the piece and its legal destinations', () => {
    const state = baseState(createInitialBoard());
    // (5,2) has both forward diagonals (4,1) and (4,3) open in the starting position.
    const next = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 2 } });
    expect(next.selected).toEqual({ row: 5, col: 2 });
  });
});

// --- Select immovable own piece --------------------------------------------
describe('select immovable own piece', () => {
  it('does not select a piece with no legal moves', () => {
    const state = baseState(createInitialBoard());
    // (6,1) is boxed in by red pieces at (5,0) and (5,2) in the starting position.
    const next = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 6, col: 1 } });
    expect(next.selected).toBeNull();
  });
});

// --- Mandatory capture elsewhere -------------------------------------------
describe('mandatory capture elsewhere', () => {
  it('excludes a non-capturing piece from the legal move list, and blocks selecting it', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red'); // piece A: can capture in two directions
    board = place(board, { row: 3, col: 3 }, 'black');
    board = place(board, { row: 3, col: 5 }, 'black');
    board = place(board, { row: 5, col: 0 }, 'red'); // piece B: only a simple move available

    const legalMoves = getAllLegalMoves(board, 'red');
    expect(legalMoves).toHaveLength(2);
    expect(legalMoves.every((m) => m.captured !== undefined)).toBe(true);
    expect(legalMoves.some((m) => m.from.row === 5 && m.from.col === 0)).toBe(false);

    const state = baseState(board);
    const next = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 0 } });
    expect(next).toBe(state); // no-op: piece B cannot be selected
  });
});

// --- Multi-jump continuation ------------------------------------------------
describe('multi-jump continuation', () => {
  it('keeps the turn open on the same piece and offers a choice of further captures', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red', 'king');
    board = place(board, { row: 3, col: 3 }, 'black'); // captured by first jump (chosen branch)
    board = place(board, { row: 3, col: 5 }, 'black'); // alternate first-jump branch (left untouched)
    board = place(board, { row: 1, col: 1 }, 'black'); // further capture option A
    board = place(board, { row: 1, col: 3 }, 'black'); // further capture option B

    // Two capture options exist at turn start, so nothing auto-plays yet -- the
    // click-to-select-then-click-to-move flow below reflects real interaction.
    let state = baseState(board);
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 4, col: 4 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 2 } });

    expect(state.mustContinueFrom).toEqual({ row: 2, col: 2 });
    expect(state.currentPlayer).toBe('red');
    expect(state.capturedCount.red).toBe(1);

    // Selecting another square (not a legal continuation) is blocked.
    const blocked = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 5 } });
    expect(blocked.mustContinueFrom).toEqual({ row: 2, col: 2 });
    expect(blocked.selected).toEqual({ row: 2, col: 2 });

    // Choosing one of the two further captures completes the chain.
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 0 } });
    expect(state.mustContinueFrom).toBeNull();
    expect(state.currentPlayer).toBe('black');
    expect(state.capturedCount.red).toBe(2);
    expect(state.board[1][1]).toBeNull();
    expect(state.board[1][3]).not.toBeNull(); // the other option was never captured
  });
});

// --- Promotion ---------------------------------------------------------------
describe('promotion', () => {
  it('crowns a man that reaches the opponent back row', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 1, col: 4 }, 'red', 'man');
    const { board: nextBoard, promoted } = applyMoveToBoard(board, {
      from: { row: 1, col: 4 },
      to: { row: 0, col: 3 },
    });
    expect(promoted).toBe(true);
    expect(nextBoard[0][3]).toEqual({ color: 'red', kind: 'king' });
  });

  it('lets a man capture backward (standard draughts rule)', () => {
    let board = createEmptyBoard();
    // Red men only advance toward row 0, but must still be able to capture a
    // piece sitting behind them (toward row 7).
    board = place(board, { row: 3, col: 3 }, 'red', 'man');
    board = place(board, { row: 4, col: 4 }, 'black');

    const moves = pieceCaptureMoves(board, { row: 3, col: 3 }, 'red');
    expect(moves).toEqual([
      { from: { row: 3, col: 3 }, to: { row: 5, col: 5 }, captured: { row: 4, col: 4 } },
    ]);
  });

  it('continues a multi-jump as a king, including a backward capture, once a man promotes mid-chain', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 2, col: 4 }, 'red', 'man');
    board = place(board, { row: 1, col: 3 }, 'black'); // first jump: captured landing on row 0 -> promotes
    board = place(board, { row: 1, col: 1 }, 'black'); // second jump: only reachable backward, as a king

    // Before the chain starts, a plain man landing on (0,2) could never reach
    // (2,0) next -- that direction only becomes legal once it is a king.
    let state = baseState(board, 'red');
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 4 } });
    // Landing on (0,2) promotes the man to a king; since that leaves exactly one
    // further capture, the reducer auto-plays the rest of the chain immediately.
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 2 } });

    expect(state.mustContinueFrom).toBeNull();
    expect(state.currentPlayer).toBe('black');
    expect(state.capturedCount.red).toBe(2);
    expect(state.board[2][0]).toEqual({ color: 'red', kind: 'king' });
    expect(state.board[1][1]).toBeNull();
  });
});

// --- No legal moves (loss) ---------------------------------------------------
describe('no legal moves', () => {
  it('ends the game with the opponent as winner', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 0, col: 1 }, 'black'); // boxed in below
    board = place(board, { row: 1, col: 0 }, 'red');
    board = place(board, { row: 1, col: 2 }, 'red');
    board = place(board, { row: 2, col: 3 }, 'red'); // blocks the only possible capture landing
    board = place(board, { row: 7, col: 0 }, 'red'); // gives red a harmless move to make

    expect(hasAnyLegalMove(board, 'black')).toBe(false);

    const state = baseState(board, 'red');
    const next = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });
    expect(next.status).toEqual({ type: 'won', winner: 'red' });
  });

  it('disables further square selection once the game has ended', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 0, col: 1 }, 'black');
    board = place(board, { row: 1, col: 0 }, 'red');
    board = place(board, { row: 1, col: 2 }, 'red');
    board = place(board, { row: 2, col: 3 }, 'red');
    board = place(board, { row: 7, col: 0 }, 'red');

    let state = baseState(board, 'red');
    state = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });
    expect(state.status).toEqual({ type: 'won', winner: 'red' });

    const attempted = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 1, col: 0 } });
    expect(attempted).toBe(state);
  });
});

// --- Draw threshold -----------------------------------------------------------
describe('draw threshold', () => {
  it('draws after 40 consecutive turns with no capture', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 0, col: 7 }, 'black', 'king');

    let state = baseState(board, 'red');
    const redSquares = [{ row: 7, col: 0 }, { row: 6, col: 1 }];
    const blackSquares = [{ row: 0, col: 7 }, { row: 1, col: 6 }];
    let redMoveCount = 0;
    let blackMoveCount = 0;

    function playOneOscillation(): void {
      const isRed = state.currentPlayer === 'red';
      const squares = isRed ? redSquares : blackSquares;
      const count = isRed ? redMoveCount : blackMoveCount;
      const from = squares[count % 2];
      const to = squares[(count + 1) % 2];
      state = applyMove(state, { from, to });
      if (isRed) redMoveCount++;
      else blackMoveCount++;
    }

    for (let turn = 0; turn < 39; turn++) {
      playOneOscillation();
      expect(state.status).toEqual({ type: 'in-progress' });
    }

    expect(state.turnsSinceCapture).toBe(39);
    playOneOscillation();

    expect(state.turnsSinceCapture).toBe(40);
    expect(state.status).toEqual({ type: 'draw' });
  });
});

// --- PLAY_MOVE legality (the AI/network move-source seam) ----------------------
describe('PLAY_MOVE', () => {
  it('applies a move that is actually legal for the player to move', () => {
    const state = baseState(createInitialBoard());
    const legalMove = { from: { row: 5, col: 2 }, to: { row: 4, col: 1 } };
    const next = gameReducer(state, { type: 'PLAY_MOVE', move: legalMove });
    expect(next.board[4][1]).toEqual({ color: 'red', kind: 'man' });
    expect(next.currentPlayer).toBe('black');
  });

  it('ignores a move that is not in the current legal-move set instead of crashing', () => {
    const state = baseState(createInitialBoard());
    // Not a legal move: nothing at (0,0) to move, and (0,1) is occupied by black.
    const illegalMove = { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } };
    const next = gameReducer(state, { type: 'PLAY_MOVE', move: illegalMove });
    expect(next).toBe(state);
  });

  it('ignores a move for the wrong piece during a forced multi-jump continuation', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red', 'king');
    board = place(board, { row: 3, col: 3 }, 'black');
    board = place(board, { row: 3, col: 5 }, 'black');
    board = place(board, { row: 1, col: 1 }, 'black');
    board = place(board, { row: 1, col: 3 }, 'black');

    let state = baseState(board);
    state = gameReducer(state, { type: 'PLAY_MOVE', move: { from: { row: 4, col: 4 }, to: { row: 2, col: 2 }, captured: { row: 3, col: 3 } } });
    expect(state.mustContinueFrom).toEqual({ row: 2, col: 2 });

    // A different piece, or a move not among the forced continuations, is a no-op.
    const attempted = gameReducer(state, { type: 'PLAY_MOVE', move: { from: { row: 4, col: 4 }, to: { row: 5, col: 5 } } });
    expect(attempted).toBe(state);
  });
});

// --- No-op click ---------------------------------------------------------------
describe('no-op click', () => {
  it('does not change state when clicking an empty square with nothing selected', () => {
    const state = baseState(createInitialBoard());
    const next = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 0 } });
    expect(next).toBe(state);
  });

  it('does not change state when clicking an opponent piece with nothing selected', () => {
    const state = baseState(createInitialBoard());
    const next = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 1 } });
    expect(next).toBe(state);
  });
});

// --- Only one legal move exists (auto-play) ------------------------------------
describe('auto-play on a single legal move', () => {
  it('plays the sole legal move at the start of a turn without a click', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red'); // only (6,1) is open
    // Black has two independent pieces (more than one legal move) so its turn
    // does not itself auto-play -- isolating the assertion to red's forced move.
    board = place(board, { row: 0, col: 3 }, 'black');
    board = place(board, { row: 0, col: 7 }, 'black');

    const state = baseState(board, 'red');
    const next = withAutoPlay(state);

    expect(next.board[7][0]).toBeNull();
    expect(next.board[6][1]).toEqual({ color: 'red', kind: 'man' });
    expect(next.currentPlayer).toBe('black');
    expect(next.mustContinueFrom).toBeNull();
  });

  it('auto-plays an entire forced multi-jump chain with zero clicks', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red', 'king');
    board = place(board, { row: 3, col: 3 }, 'black'); // the only first-jump option
    board = place(board, { row: 1, col: 1 }, 'black'); // the only further capture
    // Two spare black pieces (more than one legal move) so black's own turn does
    // not also auto-play -- isolating the assertion to red's forced chain.
    board = place(board, { row: 0, col: 5 }, 'black');
    board = place(board, { row: 0, col: 7 }, 'black');

    // Both jumps in this chain are individually forced (each is the sole legal
    // move/continuation), so the whole chain should play out with no clicks at all.
    const state = withAutoPlay(baseState(board));

    expect(state.mustContinueFrom).toBeNull();
    expect(state.currentPlayer).toBe('black');
    expect(state.capturedCount.red).toBe(2);
    expect(state.board[0][0]).toEqual({ color: 'red', kind: 'king' });
    expect(state.status).toEqual({ type: 'in-progress' });
  });
});

// --- Reducer selection UX (supplementary, not in the matrix) --------------------
describe('deselecting', () => {
  it('toggles off when clicking the already-selected piece again', () => {
    const state = baseState(createInitialBoard());
    let next = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 2 } });
    expect(next.selected).toEqual({ row: 5, col: 2 });
    next = gameReducer(next, { type: 'SELECT_SQUARE', position: { row: 5, col: 2 } });
    expect(next.selected).toBeNull();
  });
});

// --- Sanity: standard starting position ------------------------------------------
describe('initial state', () => {
  it('starts with 12 pieces per side and red to move', () => {
    const state = createInitialState();
    expect(state.currentPlayer).toBe('red');
    let redCount = 0;
    let blackCount = 0;
    for (const row of state.board) {
      for (const square of row) {
        if (square?.color === 'red') redCount++;
        if (square?.color === 'black') blackCount++;
      }
    }
    expect(redCount).toBe(12);
    expect(blackCount).toBe(12);
  });
});
