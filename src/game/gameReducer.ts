import { createInitialBoard, isOnBoard, positionKey, samePosition } from './board';
import { buildLogEntry } from './moveLog';
import {
  applyMoveToBoard,
  getAllLegalMoves,
  hasAnyLegalMove,
  isInsufficientMaterial,
  pieceCaptureMoves,
} from './rules';
import type { Action, GameState, Move, Position } from './types';

/** Combined half-move count (both players) with no capture before it's a draw --
 * the page's "50 consecutive moves without a change in piece count" rule. */
export const DRAW_TURN_LIMIT = 50;

export function createInitialState(): GameState {
  const board = createInitialBoard();
  return {
    board,
    currentPlayer: 'red',
    selected: null,
    mustContinueFrom: null,
    turnsSinceCapture: 0,
    capturedCount: { red: 0, black: 0 },
    status: { type: 'in-progress' },
    history: [],
    positionHistory: [positionKey(board, 'red')],
  };
}

/**
 * The single entry point for mutating game state via a move. Every move -- whether
 * resolved from a human click or (later) an AI/network move source -- flows through
 * here. Handles capture bookkeeping, multi-jump continuation, promotion already
 * having happened in rules.ts, and win/draw detection.
 *
 * Deliberately pure, with no logging side effect: the AI's search (minimax.ts)
 * calls this many thousands of times per turn on hypothetical positions that are
 * never actually played, so recording history here would flood the audit trail
 * with moves that never happened. `history` passes through unchanged (via the
 * `...state` spreads below) -- only `withHistory`, called from the reducer's real
 * dispatch paths below, ever appends a new entry.
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

  // A position from before a capture can never recur once the piece count has
  // changed, so a capture resets the tracked history instead of just appending.
  const nextKey = positionKey(nextBoard, nextPlayer);
  const positionHistory = madeCapture ? [nextKey] : [...state.positionHistory, nextKey];
  const repeated3Times = positionHistory.filter((key) => key === nextKey).length >= 3;

  const status: GameState['status'] = !hasAnyLegalMove(nextBoard, nextPlayer)
    ? { type: 'won', winner: state.currentPlayer }
    : turnsSinceCapture >= DRAW_TURN_LIMIT || repeated3Times || isInsufficientMaterial(nextBoard)
      ? { type: 'draw' }
      : { type: 'in-progress' };

  return {
    ...state,
    board: nextBoard,
    currentPlayer: nextPlayer,
    selected: null,
    mustContinueFrom: null,
    capturedCount,
    turnsSinceCapture,
    positionHistory,
    status,
  };
}

/**
 * Wraps a real, committed move with its audit-trail entry. Only ever called from
 * the reducer's own dispatch paths below (a human click or an AI PLAY_MOVE) --
 * never from the AI's internal search, which must stay on the plain, unlogged
 * `applyMove`.
 */
function withHistory(state: GameState, move: Move, nextState: GameState): GameState {
  return { ...nextState, history: [...state.history, buildLogEntry(state, move, nextState)] };
}

/** The legal moves the player-to-move (or an in-progress multi-jump) may currently choose from. */
export function currentLegalMoves(state: GameState): Move[] {
  if (state.mustContinueFrom) {
    return pieceCaptureMoves(state.board, state.mustContinueFrom, state.currentPlayer);
  }
  return getAllLegalMoves(state.board, state.currentPlayer);
}

function sameMove(a: Move, b: Move): boolean {
  return (
    samePosition(a.from, b.from) &&
    samePosition(a.to, b.to) &&
    (a.captured === undefined) === (b.captured === undefined) &&
    (a.captured === undefined || samePosition(a.captured, b.captured!))
  );
}

function handleSelectSquare(state: GameState, position: Position): GameState {
  if (state.status.type !== 'in-progress') return state;
  if (!isOnBoard(position)) return state;

  if (state.mustContinueFrom) {
    const moves = pieceCaptureMoves(state.board, state.mustContinueFrom, state.currentPlayer);
    const move = moves.find((m) => samePosition(m.to, position));
    return move ? withHistory(state, move, applyMove(state, move)) : state;
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
      return withHistory(state, move, applyMove(state, move));
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
    case 'PLAY_MOVE': {
      if (state.status.type !== 'in-progress') return state;
      const legalMove = currentLegalMoves(state).find((m) => sameMove(m, action.move));
      return legalMove ? withHistory(state, legalMove, applyMove(state, legalMove)) : state;
    }
    default:
      return state;
  }
}
