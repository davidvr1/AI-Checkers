export type PieceColor = 'red' | 'black';
export type PieceKind = 'man' | 'king';

export interface Piece {
  color: PieceColor;
  kind: PieceKind;
}

export interface Position {
  row: number;
  col: number;
}

export type Square = Piece | null;

/** 8x8 grid, rows 0-7 top to bottom, cols 0-7 left to right. Only dark squares are ever occupied. */
export type Board = Square[][];

/** A single diagonal step: a plain move, or one jump if `captured` is set. */
export interface Move {
  from: Position;
  to: Position;
  captured?: Position;
}

export interface CapturedCount {
  red: number;
  black: number;
}

export type GameStatus =
  | { type: 'in-progress' }
  | { type: 'won'; winner: PieceColor }
  | { type: 'draw' };

export interface GameState {
  board: Board;
  currentPlayer: PieceColor;
  /** Currently selected piece, or null if nothing is selected. */
  selected: Position | null;
  /** Set while a multi-jump chain is in progress: only this piece may move, and only by capturing. */
  mustContinueFrom: Position | null;
  /** Consecutive completed turns (both players combined) with no capture; draw at 40. */
  turnsSinceCapture: number;
  capturedCount: CapturedCount;
  status: GameStatus;
}

export type GameMode = 'human' | 'ai';
export type Difficulty = 'easy' | 'medium' | 'hard';

export type GameConfig =
  | { mode: 'human' }
  | { mode: 'ai'; humanColor: PieceColor; difficulty: Difficulty };

export type Action =
  | { type: 'SELECT_SQUARE'; position: Position }
  | { type: 'PLAY_MOVE'; move: Move };
