import { describe, expect, it } from 'vitest';
import { createEmptyBoard, setPiece } from '../game/board';
import type { Board, GameState, PieceColor } from '../game/types';
import { evaluate } from './evaluate';

function wonState(winner: PieceColor): GameState {
  return {
    board: createEmptyBoard(),
    currentPlayer: winner,
    selected: null,
    mustContinueFrom: null,
    turnsSinceCapture: 0,
    capturedCount: { red: 0, black: 0 },
    status: { type: 'won', winner },
    history: [],
  };
}

function materialState(board: Board): GameState {
  return {
    board,
    currentPlayer: 'red',
    selected: null,
    mustContinueFrom: null,
    turnsSinceCapture: 0,
    capturedCount: { red: 0, black: 0 },
    status: { type: 'in-progress' },
    history: [],
  };
}

describe('evaluate: depth-adjusted terminal scores', () => {
  it('prefers a faster win: a closer mate scores higher than a distant one', () => {
    const state = wonState('red');
    expect(evaluate(state, 'red', 1)).toBeGreaterThan(evaluate(state, 'red', 6));
  });

  it('delays a loss: a further-off loss is less bad than an imminent one', () => {
    const state = wonState('black'); // red is losing
    expect(evaluate(state, 'red', 6)).toBeGreaterThan(evaluate(state, 'red', 1));
  });

  it('ply adjustment never reorders a win against a material lead', () => {
    // Red is up a whole king in an in-progress position -- the strongest possible
    // material score -- yet a win at any realistic ply still dominates it.
    let board = createEmptyBoard();
    board = setPiece(board, { row: 4, col: 3 }, { color: 'red', kind: 'king' });
    const materialLead = evaluate(materialState(board), 'red');
    const distantWin = evaluate(wonState('red'), 'red', 20);
    expect(distantWin).toBeGreaterThan(materialLead);
  });

  it('scores an in-progress position on material alone, unaffected by ply', () => {
    let board = createEmptyBoard();
    board = setPiece(board, { row: 4, col: 3 }, { color: 'red', kind: 'man' });
    board = setPiece(board, { row: 2, col: 1 }, { color: 'black', kind: 'man' });
    expect(evaluate(materialState(board), 'red', 5)).toBe(0); // one man each
  });
});
