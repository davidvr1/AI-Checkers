import { describe, expect, it } from 'vitest';
import { createEmptyBoard, setPiece } from './board';
import { applyMove, gameReducer } from './gameReducer';
import { buildLogEntry, formatLogEntry } from './moveLog';
import type { Board, GameState, PieceColor, PieceKind, Position } from './types';

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
    history: [],
  };
}

describe('buildLogEntry', () => {
  it('describes a simple move with no capture', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 5, col: 2 }, 'red');
    const state = baseState(board);
    const move = { from: { row: 5, col: 2 }, to: { row: 4, col: 1 } };

    const entry = buildLogEntry(state, move, applyMove(state, move));
    expect(entry).toMatchObject({
      index: 0,
      player: 'red',
      piece: { color: 'red', kind: 'man' },
      from: move.from,
      to: move.to,
      promoted: false,
    });
    // Omitted, not present-with-undefined -- a consumer checking `'captured' in
    // entry` must see false for a non-capturing move.
    expect('captured' in entry).toBe(false);
  });

  it('describes a capture with a specific, human-readable reason', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red');
    board = place(board, { row: 3, col: 3 }, 'black');
    const state = baseState(board);
    const move = { from: { row: 4, col: 4 }, to: { row: 2, col: 2 }, captured: { row: 3, col: 3 } };

    const entry = buildLogEntry(state, move, applyMove(state, move));
    expect(entry.captured).toBeDefined();
    expect(entry.captured!.position).toEqual({ row: 3, col: 3 });
    expect(entry.captured!.piece).toEqual({ color: 'black', kind: 'man' });
    expect(entry.captured!.reason).toContain('red');
    expect(entry.captured!.reason).toContain('jumped');
  });

  it('detects promotion by comparing the piece before and after', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 1, col: 4 }, 'red', 'man');
    const state = baseState(board);
    const move = { from: { row: 1, col: 4 }, to: { row: 0, col: 3 } };

    expect(buildLogEntry(state, move, applyMove(state, move)).promoted).toBe(true);
  });

  it('numbers entries by the length of history so far, not a global counter', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 5, col: 2 }, 'red');
    let state = baseState(board);
    state = { ...state, history: [{} as never, {} as never] }; // pretend two moves already happened

    const move = { from: { row: 5, col: 2 }, to: { row: 4, col: 1 } };
    expect(buildLogEntry(state, move, applyMove(state, move)).index).toBe(2);
  });
});

describe('formatLogEntry', () => {
  it('renders a readable single line including the capture reason', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red');
    board = place(board, { row: 3, col: 3 }, 'black');
    const state = baseState(board);
    const move = { from: { row: 4, col: 4 }, to: { row: 2, col: 2 }, captured: { row: 3, col: 3 } };

    const line = formatLogEntry(buildLogEntry(state, move, applyMove(state, move)));
    expect(line).toContain('red man');
    expect(line).toContain('removed black man');
    expect(line).toContain('jumped');
  });
});

describe('gameReducer: history is the audit trail for real, committed moves only', () => {
  it('accumulates entries in order across a real click-driven sequence', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 5, col: 2 }, 'red');
    board = place(board, { row: 2, col: 1 }, 'black');

    let state = baseState(board);
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 2 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 4, col: 1 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 1 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 3, col: 2 } });

    expect(state.history.map((e) => e.index)).toEqual([0, 1]);
    expect(state.history[0].player).toBe('red');
    expect(state.history[1].player).toBe('black');
  });

  it('does not record a click that only selects a piece, or a no-op click', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 5, col: 2 }, 'red');
    let state = baseState(board);

    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 2 } }); // select only
    expect(state.history).toHaveLength(0);

    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 5, col: 2 } }); // deselect (no-op)
    expect(state.history).toHaveLength(0);
  });

  it("never grows history from the AI search's internal applyMove calls", () => {
    // Mirrors what minimax.ts's search() does: a speculative applyMove call on a
    // hypothetical position that is never dispatched through the reducer.
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red');
    const state = baseState(board);

    const hypothetical = applyMove(state, { from: { row: 4, col: 4 }, to: { row: 3, col: 3 } });
    expect(hypothetical.history).toHaveLength(0);
  });

  it('records one entry per leg of a real multi-jump chain, same player, sequential index', () => {
    let board = createEmptyBoard();
    board = place(board, { row: 4, col: 4 }, 'red', 'king');
    board = place(board, { row: 3, col: 3 }, 'black'); // first jump's target
    board = place(board, { row: 3, col: 5 }, 'black'); // alternate first-jump branch, left untouched
    board = place(board, { row: 1, col: 1 }, 'black'); // second jump's target (chosen)
    board = place(board, { row: 1, col: 3 }, 'black'); // alternate second-jump branch, left untouched

    let state = baseState(board);
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 4, col: 4 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 2, col: 2 } }); // leg 1
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ index: 0, player: 'red', from: { row: 4, col: 4 }, to: { row: 2, col: 2 } });
    expect(state.history[0].captured?.position).toEqual({ row: 3, col: 3 });
    expect(state.history[0].resultingStatus).toEqual({ type: 'in-progress' }); // chain still open

    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 0, col: 0 } }); // leg 2
    expect(state.history).toHaveLength(2);
    expect(state.history[1]).toMatchObject({ index: 1, player: 'red', from: { row: 2, col: 2 }, to: { row: 0, col: 0 } });
    expect(state.history[1].captured?.position).toEqual({ row: 1, col: 1 });
    expect(state.currentPlayer).toBe('black'); // the whole chain used one turn
  });

  it("records the game-ending move's resultingStatus", () => {
    let board = createEmptyBoard();
    board = place(board, { row: 0, col: 1 }, 'black'); // boxed in below
    board = place(board, { row: 1, col: 0 }, 'red');
    board = place(board, { row: 1, col: 2 }, 'red');
    board = place(board, { row: 2, col: 3 }, 'red'); // blocks the only possible capture landing
    board = place(board, { row: 7, col: 0 }, 'red'); // gives red a harmless move to make

    let state = baseState(board, 'red');
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 7, col: 0 } });
    state = gameReducer(state, { type: 'SELECT_SQUARE', position: { row: 6, col: 1 } });

    expect(state.status).toEqual({ type: 'won', winner: 'red' });
    expect(state.history).toHaveLength(1);
    expect(state.history[0].resultingStatus).toEqual({ type: 'won', winner: 'red' });
  });
});
