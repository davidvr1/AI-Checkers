import { describe, expect, it } from 'vitest';
import { createEmptyBoard, createInitialBoard, positionKey, setPiece } from './board';
import { DRAW_TURN_LIMIT, applyMove, createInitialState, currentLegalMoves, gameReducer } from './gameReducer';
import {
  applyMoveToBoard,
  getAllLegalMoves,
  hasAnyLegalMove,
  isInsufficientMaterial,
  pieceCaptureMoves,
  pieceSimpleMoves,
} from './rules';
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
    history: [],
    positionHistory: [positionKey(board, currentPlayer)],
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

  it('does NOT let a man capture backward (house rule: men capture forward only)', () => {
    let board = createEmptyBoard();
    // Red men advance toward row 0; a black man sits behind the red man (toward
    // row 7). Under the forward-only house rule the red man may not jump it.
    board = place(board, { row: 3, col: 3 }, 'red', 'man');
    board = place(board, { row: 4, col: 4 }, 'black');

    expect(pieceCaptureMoves(board, { row: 3, col: 3 }, 'red')).toEqual([]);
  });

  it('lets a man capture forward over an adjacent enemy', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 3, col: 3 }, 'red', 'man'); // forward is toward row 0
    board = place(board, { row: 2, col: 2 }, 'black');

    expect(pieceCaptureMoves(board, { row: 3, col: 3 }, 'red')).toEqual([
      { from: { row: 3, col: 3 }, to: { row: 1, col: 1 }, captured: { row: 2, col: 2 } },
    ]);
  });

  it('ends the turn immediately when a man promotes mid-chain, even if a further capture exists', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 2, col: 4 }, 'red', 'man');
    board = place(board, { row: 1, col: 3 }, 'black'); // first jump: captured, landing on row 0 -> promotes
    board = place(board, { row: 1, col: 1 }, 'black'); // a would-be second jump, reachable only as a king

    let state = baseState(board, 'red');
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 4 } });
    // Landing on (0,2) crowns the man. Under the Israeli/international rule (and
    // the user's renegotiation), promotion ENDS the turn -- the piece does not
    // keep capturing as a freshly-minted king, so the further jump to (2,0) is
    // never offered and the turn passes to black.
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 2 } });

    expect(state.mustContinueFrom).toBeNull();
    expect(state.currentPlayer).toBe('black');
    expect(state.capturedCount.red).toBe(1); // only the first jump counted
    expect(state.board[0][2]).toEqual({ color: 'red', kind: 'king' });
    expect(state.board[1][1]).not.toBeNull(); // the second black piece survives -- never captured
  });

  it('still lets an already-a-king continue a multi-jump chain (promotion-ends-turn does not apply to kings)', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red', 'king'); // already a king
    board = place(board, { row: 3, col: 3 }, 'black'); // first jump target
    board = place(board, { row: 1, col: 1 }, 'black'); // forced continuation target

    let state = baseState(board, 'red');
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 4, col: 4 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 2 } }); // leg 1
    expect(state.mustContinueFrom).toEqual({ row: 2, col: 2 }); // chain stays open
    expect(state.currentPlayer).toBe('red');

    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 0 } }); // leg 2
    expect(state.mustContinueFrom).toBeNull();
    expect(state.currentPlayer).toBe('black');
    expect(state.capturedCount.red).toBe(2);
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
// Tested by directly seeding `turnsSinceCapture` near the limit rather than by
// playing out dozens of real moves: a real non-capturing oscillation would also
// trip the (separately tested) threefold-repetition draw long before reaching
// this limit, since bouncing a piece between two squares repeats the whole-board
// position every 4 half-moves. Each side gets a second, stationary king purely
// so the board never satisfies the (separately tested) insufficient-material
// draw regardless of where the moving kings are.
describe('draw threshold', () => {
  function fourKingBoard(): Board {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 7, col: 2 }, 'red', 'king');
    board = place(board, { row: 0, col: 7 }, 'black', 'king');
    board = place(board, { row: 0, col: 5 }, 'black', 'king');
    return board;
  }

  it(`draws once turnsSinceCapture reaches the ${DRAW_TURN_LIMIT}-half-move limit`, () => {
    let state = baseState(fourKingBoard(), 'red');
    state = { ...state, turnsSinceCapture: DRAW_TURN_LIMIT - 1, positionHistory: [] };

    state = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });

    expect(state.turnsSinceCapture).toBe(DRAW_TURN_LIMIT);
    expect(state.status).toEqual({ type: 'draw' });
  });

  it('stays in-progress the half-move before the limit', () => {
    let state = baseState(fourKingBoard(), 'red');
    state = { ...state, turnsSinceCapture: DRAW_TURN_LIMIT - 2, positionHistory: [] };

    state = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });

    expect(state.turnsSinceCapture).toBe(DRAW_TURN_LIMIT - 1);
    expect(state.status).toEqual({ type: 'in-progress' });
  });
});

// --- Threefold repetition ------------------------------------------------------
describe('threefold repetition', () => {
  it('draws when the same position (board + player to move) recurs a third time', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 7, col: 2 }, 'red', 'king');
    board = place(board, { row: 0, col: 7 }, 'black', 'king');
    board = place(board, { row: 0, col: 5 }, 'black', 'king');
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

    // The full board position (both kings' squares + whose turn it is) repeats
    // every 4 half-moves: red-out, black-out, red-back, black-back returns to the
    // exact starting layout with red to move again -- the 3rd occurrence lands
    // after 8 half-moves (turns 0 and 4 recreate the start; the reducer's own
    // pre-move state already counts as the 1st).
    for (let turn = 0; turn < 7; turn++) {
      playOneOscillation();
      expect(state.status).toEqual({ type: 'in-progress' });
    }

    playOneOscillation();
    expect(state.status).toEqual({ type: 'draw' });
  });
});

// --- Insufficient material -----------------------------------------------------
describe('insufficient material', () => {
  it('draws once reduced to one king per side with no capture available to the mover', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 0, col: 3 }, 'black', 'king'); // not on a shared open diagonal with red after the move
    const state = baseState(board, 'red');

    // After (7,0)->(6,1), black king at (0,3) has no diagonal line to red at (6,1),
    // so black cannot capture -- two lone kings that can only shuffle: a draw.
    const next = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });
    expect(next.status).toEqual({ type: 'draw' });
  });

  it('does NOT draw when reducing to one king per side leaves the mover a winning capture', () => {
    // Red king (7,0), black king (0,7) sit on the same long diagonal. Red slides to
    // (6,1); now black (0,7) can fly down that diagonal and capture red's last king
    // -- so this is a win a ply away, NOT insufficient-material. The engine must let
    // the game continue rather than declaring an immediate draw.
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 0, col: 7 }, 'black', 'king');
    let state = baseState(board, 'red');

    state = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });
    expect(state.status).toEqual({ type: 'in-progress' }); // not a draw -- black can capture
    expect(currentLegalMoves(state).some((m) => m.captured !== undefined)).toBe(true);

    // Black takes red's last king -> red has no pieces -> black wins.
    const winning = currentLegalMoves(state).find((m) => m.captured !== undefined)!;
    state = applyMove(state, winning);
    expect(state.status).toEqual({ type: 'won', winner: 'black' });
  });

  it('does not draw while any side still has a man on the board', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 0, col: 7 }, 'black', 'man');
    const state = baseState(board, 'red');

    const next = applyMove(state, { from: { row: 7, col: 0 }, to: { row: 6, col: 1 } });
    expect(next.status).toEqual({ type: 'in-progress' });
  });

  it('isInsufficientMaterial requires one king per SIDE, not merely two kings total', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 5, col: 2 }, 'red', 'king'); // two RED kings, no black
    expect(isInsufficientMaterial(board)).toBe(false);

    board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 0, col: 7 }, 'black', 'king');
    expect(isInsufficientMaterial(board)).toBe(true);
  });
});

// --- Flying kings ---------------------------------------------------------------
describe('flying kings: simple moves', () => {
  it('slides any distance along a clear diagonal, in any of the 4 directions', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 3 }, 'red', 'king');

    const moves = pieceSimpleMoves(board, { row: 4, col: 3 });
    const destinations = moves.map((m) => `${m.to.row},${m.to.col}`);

    // Up-left: (3,2) (2,1) (1,0). Up-right: (3,4) (2,5) (1,6) (0,7).
    // Down-left: (5,2) (6,1) (7,0). Down-right: (5,4) (6,5) (7,6).
    expect(destinations.sort()).toEqual(
      ['3,2', '2,1', '1,0', '3,4', '2,5', '1,6', '0,7', '5,2', '6,1', '7,0', '5,4', '6,5', '7,6'].sort(),
    );
  });

  it('stops sliding at the first occupied square, in either color', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 3 }, 'red', 'king');
    board = place(board, { row: 2, col: 1 }, 'black');

    const moves = pieceSimpleMoves(board, { row: 4, col: 3 });
    const upLeft = moves.filter((m) => m.to.row < 4 && m.to.col < 3);
    expect(upLeft.map((m) => `${m.to.row},${m.to.col}`).sort()).toEqual(['3,2']); // (2,1) itself and beyond are unreachable
  });
});

describe('flying kings: captures', () => {
  it('offers every empty landing square beyond the captured piece, not just the nearest one', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 4, col: 3 }, 'black');

    const moves = pieceCaptureMoves(board, { row: 7, col: 0 }, 'red');
    expect(moves).toEqual(
      expect.arrayContaining([
        { from: { row: 7, col: 0 }, to: { row: 3, col: 4 }, captured: { row: 4, col: 3 } },
        { from: { row: 7, col: 0 }, to: { row: 2, col: 5 }, captured: { row: 4, col: 3 } },
        { from: { row: 7, col: 0 }, to: { row: 1, col: 6 }, captured: { row: 4, col: 3 } },
        { from: { row: 7, col: 0 }, to: { row: 0, col: 7 }, captured: { row: 4, col: 3 } },
      ]),
    );
    expect(moves).toHaveLength(4);
  });

  it('cannot capture two pieces on the same line in one leg -- a second piece right behind the first blocks landing entirely', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 4, col: 3 }, 'black');
    board = place(board, { row: 3, col: 4 }, 'black'); // immediately behind the first -- no empty landing exists

    const moves = pieceCaptureMoves(board, { row: 7, col: 0 }, 'red');
    expect(moves).toEqual([]);
  });

  it('cannot jump its own piece', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 4, col: 3 }, 'red');

    const moves = pieceCaptureMoves(board, { row: 7, col: 0 }, 'red');
    expect(moves).toEqual([]);
  });
});

describe('men capture forward only (house rule), regardless of the target piece', () => {
  it('allows a man to jump an enemy man forward', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 3, col: 3 }, 'red', 'man'); // forward is toward row 0
    board = place(board, { row: 2, col: 2 }, 'black', 'man');

    expect(pieceCaptureMoves(board, { row: 3, col: 3 }, 'red')).toEqual([
      { from: { row: 3, col: 3 }, to: { row: 1, col: 1 }, captured: { row: 2, col: 2 } },
    ]);
  });

  it('allows a man to jump an enemy king forward', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 3, col: 3 }, 'red', 'man'); // forward is toward row 0
    board = place(board, { row: 2, col: 2 }, 'black', 'king');

    expect(pieceCaptureMoves(board, { row: 3, col: 3 }, 'red')).toEqual([
      { from: { row: 3, col: 3 }, to: { row: 1, col: 1 }, captured: { row: 2, col: 2 } },
    ]);
  });

  it('forbids a man from jumping backward -- whether the target is a man or a king', () => {
    let manBehind = createEmptyBoard();
    manBehind = place(manBehind, { row: 3, col: 3 }, 'red', 'man');
    manBehind = place(manBehind, { row: 4, col: 4 }, 'black', 'man'); // behind the man
    expect(pieceCaptureMoves(manBehind, { row: 3, col: 3 }, 'red')).toEqual([]);

    let kingBehind = createEmptyBoard();
    kingBehind = place(kingBehind, { row: 3, col: 3 }, 'red', 'man');
    kingBehind = place(kingBehind, { row: 4, col: 4 }, 'black', 'king'); // behind the man
    expect(pieceCaptureMoves(kingBehind, { row: 3, col: 3 }, 'red')).toEqual([]);
  });

  it('applies symmetrically to black (whose forward is toward row 7)', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'black', 'man'); // black advances toward row 7
    board = place(board, { row: 5, col: 5 }, 'red', 'man'); // forward target -> legal
    board = place(board, { row: 3, col: 3 }, 'red', 'man'); // backward target -> illegal

    expect(pieceCaptureMoves(board, { row: 4, col: 4 }, 'black')).toEqual([
      { from: { row: 4, col: 4 }, to: { row: 6, col: 6 }, captured: { row: 5, col: 5 } },
    ]);
  });
});

describe('flying kings: long-range multi-jump chain through the reducer', () => {
  it('captures at range, then continues on a new diagonal, all in one turn', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red', 'king');
    board = place(board, { row: 4, col: 3 }, 'black', 'king'); // leg 1 target: up-right, at range from (7,0)
    board = place(board, { row: 1, col: 4 }, 'black', 'king'); // leg 2 target: up-left from the (2,5) landing

    let state = baseState(board, 'red');
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 7, col: 0 } });

    // Leg 1: sliding up-right, the king jumps (4,3) and may land on any empty square
    // beyond it -- (3,4), (2,5), (1,6), or (0,7). Choose (2,5), from which a second
    // capture (of the king at (1,4), up-left, landing (0,3)) becomes available.
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 5 } });
    expect(state.mustContinueFrom).toEqual({ row: 2, col: 5 }); // chain stays open (a king, not a promoting man)
    expect(state.currentPlayer).toBe('red');
    expect(state.board[4][3]).toBeNull(); // leg 1 piece removed

    const continuations = currentLegalMoves(state);
    expect(continuations).toEqual([
      { from: { row: 2, col: 5 }, to: { row: 0, col: 3 }, captured: { row: 1, col: 4 } },
    ]);
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 3 } });

    expect(state.currentPlayer).toBe('black'); // whole chain used exactly one turn
    expect(state.capturedCount.red).toBe(2);
    expect(state.board[1][4]).toBeNull();
  });
});

describe('positionHistory: reset-on-capture invariant', () => {
  it('appends a key on a non-capturing move but resets to just the new key on a capture', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 5, col: 0 }, 'red', 'king');
    board = place(board, { row: 2, col: 3 }, 'black', 'king');
    board = place(board, { row: 6, col: 7 }, 'red', 'king'); // extra pieces so the board isn't 1-v-1 insufficient material
    board = place(board, { row: 1, col: 6 }, 'black', 'king');
    let state = baseState(board, 'red');
    expect(state.positionHistory).toHaveLength(1); // seeded with the initial position

    // A non-capturing move appends: history grows to 2.
    state = applyMove(state, { from: { row: 5, col: 0 }, to: { row: 4, col: 1 } });
    expect(state.positionHistory).toHaveLength(2);

    // Black makes a non-capturing move: grows to 3.
    state = applyMove(state, { from: { row: 1, col: 6 }, to: { row: 0, col: 5 } });
    expect(state.positionHistory).toHaveLength(3);

    // Red captures the black king at (2,3): a capture resets history to a single key.
    const redCapture = currentLegalMoves(state).find((m) => m.captured !== undefined);
    expect(redCapture).toBeDefined();
    state = applyMove(state, redCapture!);
    expect(state.positionHistory).toHaveLength(1);
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

// --- Only one legal move exists (no auto-play) ----------------------------------
describe('a single legal move/continuation is never auto-played', () => {
  it('does not move the sole legal piece until its destination is explicitly clicked', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 7, col: 0 }, 'red'); // only (6,1) is open
    board = place(board, { row: 0, col: 3 }, 'black');
    board = place(board, { row: 0, col: 7 }, 'black');

    let state = baseState(board, 'red');
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 7, col: 0 } });
    // Selecting the piece highlights its one legal destination but does not move it.
    expect(state.selected).toEqual({ row: 7, col: 0 });
    expect(state.board[7][0]).toEqual({ color: 'red', kind: 'man' });
    expect(state.currentPlayer).toBe('red');

    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 6, col: 1 } });
    expect(state.board[7][0]).toBeNull();
    expect(state.board[6][1]).toEqual({ color: 'red', kind: 'man' });
    expect(state.currentPlayer).toBe('black');
  });

  it('does not auto-continue a forced multi-jump -- each jump needs its own click', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red', 'king');
    board = place(board, { row: 3, col: 3 }, 'black'); // the only first-jump option
    board = place(board, { row: 1, col: 1 }, 'black'); // the only further capture
    board = place(board, { row: 0, col: 5 }, 'black');
    board = place(board, { row: 0, col: 7 }, 'black');

    let state = baseState(board);
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 4, col: 4 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 2 } });

    // The first jump landed, but the forced second jump has NOT happened yet --
    // the turn stays open on the same piece, waiting for its own click.
    expect(state.mustContinueFrom).toEqual({ row: 2, col: 2 });
    expect(state.currentPlayer).toBe('red');
    expect(state.capturedCount.red).toBe(1);
    expect(state.board[1][1]).not.toBeNull();

    // Clicking the (single, highlighted) continuation completes the chain.
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 0 } });
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
