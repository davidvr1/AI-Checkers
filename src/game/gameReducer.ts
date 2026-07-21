import { createInitialBoard, isOnBoard, samePosition } from './board';
import { applyMoveToBoard, getAllLegalMoves, hasAnyLegalMove, pieceCaptureMoves } from './rules';
import type { Action, GameState, Move, Position } from './types';

export const DRAW_TURN_LIMIT = 40;

export function createInitialState(): GameState {
  return {
    board: createInitialBoard(),
    currentPlayer: 'red',
    selected: null,
    mustContinueFrom: null,
    turnsSinceCapture: 0,
    capturedCount: { red: 0, black: 0 },
    status: { type: 'in-progress' },
  };
}

/**
 * The single entry point for mutating game state via a move. Every move -- whether
 * resolved from a human click or (later) an AI/network move source -- flows through
 * here. Handles capture bookkeeping, multi-jump continuation, promotion already
 * having happened in rules.ts, and win/draw detection.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const { board: nextBoard } = applyMoveToBoard(state.board, move);
  const madeCapture = move.captured !== undefined;

  const capturedCount = madeCapture
    ? {
        ...state.capturedCount,
        [state.currentPlayer]: state.capturedCount[state.currentPlayer] + 1,
      }
    : state.capturedCount;

  const continuationMoves = madeCapture
    ? pieceCaptureMoves(nextBoard, move.to, state.currentPlayer)
    : [];

  if (continuationMoves.length > 0) {
    return {
      ...state,
      board: nextBoard,
      selected: move.to,
      mustContinueFrom: move.to,
      capturedCount,
      turnsSinceCapture: 0,
      status: { type: 'in-progress' },
    };
  }

  const nextPlayer = state.currentPlayer === 'red' ? 'black' : 'red';
  const turnsSinceCapture = madeCapture ? 0 : state.turnsSinceCapture + 1;

  const status: GameState['status'] =
    turnsSinceCapture >= DRAW_TURN_LIMIT
      ? { type: 'draw' }
      : hasAnyLegalMove(nextBoard, nextPlayer)
        ? { type: 'in-progress' }
        : { type: 'won', winner: state.currentPlayer };

  return {
    ...state,
    board: nextBoard,
    currentPlayer: nextPlayer,
    selected: null,
    mustContinueFrom: null,
    capturedCount,
    turnsSinceCapture,
    status,
  };
}

/** The legal moves the player-to-move (or an in-progress multi-jump) may currently choose from. */
export function currentLegalMoves(state: GameState): Move[] {
  if (state.mustContinueFrom) {
    return pieceCaptureMoves(state.board, state.mustContinueFrom, state.currentPlayer);
  }
  return getAllLegalMoves(state.board, state.currentPlayer);
}

/**
 * Repeatedly auto-plays the sole legal move whenever the player to move (or an
 * in-progress multi-jump) has exactly one legal move/continuation available.
 */
export function withAutoPlay(state: GameState): GameState {
  let current = state;
  while (current.status.type === 'in-progress') {
    const moves = currentLegalMoves(current);
    if (moves.length !== 1) break;
    current = applyMove(current, moves[0]);
  }
  return current;
}

function handleSelectSquare(state: GameState, position: Position): GameState {
  if (state.status.type !== 'in-progress') return state;
  if (!isOnBoard(position)) return state;

  if (state.mustContinueFrom) {
    const moves = pieceCaptureMoves(state.board, state.mustContinueFrom, state.currentPlayer);
    const move = moves.find((m) => samePosition(m.to, position));
    return move ? withAutoPlay(applyMove(state, move)) : state;
  }

  const legalMoves = getAllLegalMoves(state.board, state.currentPlayer);

  if (state.selected) {
    if (samePosition(state.selected, position)) {
      return { ...state, selected: null };
    }
    const move = legalMoves.find(
      (m) => samePosition(m.from, state.selected!) && samePosition(m.to, position),
    );
    if (move) {
      return withAutoPlay(applyMove(state, move));
    }
  }

  const piece = state.board[position.row][position.col];
  const isOwnMovablePiece =
    piece?.color === state.currentPlayer && legalMoves.some((m) => samePosition(m.from, position));

  if (isOwnMovablePiece) {
    return { ...state, selected: position };
  }

  return state.selected ? { ...state, selected: null } : state;
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SELECT_SQUARE':
      return handleSelectSquare(state, action.position);
    default:
      return state;
  }
}
