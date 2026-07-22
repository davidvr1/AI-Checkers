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

/**
 * One entry in the game's audit trail: what moved, whether it captured
 * something and why that piece was removed (capture is the only way a piece is
 * ever removed from the board), and whether it promoted. Appended only for
 * moves that actually happen in the real game -- never for a hypothetical
 * position the AI's search merely considered.
 */
export interface MoveLogEntry {
  index: number;
  player: PieceColor;
  piece: Piece;
  from: Position;
  to: Position;
  captured?: {
    position: Position;
    piece: Piece;
    reason: string;
  };
  promoted: boolean;
  resultingStatus: GameStatus;
}

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
  /** Every move actually played so far, oldest first. See MoveLogEntry. */
  history: MoveLogEntry[];
}

export type GameMode = 'human' | 'ai';
export type Difficulty = 'easy' | 'medium' | 'hard';

export type GameConfig =
  | { mode: 'human' }
  | { mode: 'ai'; humanColor: PieceColor; difficulty: Difficulty };

export type Action =
  | { type: 'SELECT_SQUARE'; position: Position }
  | { type: 'PLAY_MOVE'; move: Move };
