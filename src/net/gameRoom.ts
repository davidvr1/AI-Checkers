import { BOARD_SIZE } from '../game/board';
import { createInitialState, gameReducer } from '../game/gameReducer';
import type { GameState, Move, PieceColor, Position } from '../game/types';
import type { ChatMessage, PlayerPresence, Role } from './protocol';

/** Longest chat message accepted; longer text is truncated. */
export const MAX_CHAT_LENGTH = 500;
/** How many recent chat lines the room keeps (and replays to a joining client). */
export const CHAT_HISTORY_LIMIT = 50;

function isPosition(p: unknown): p is Position {
  if (!p || typeof p !== 'object') return false;
  const { row, col } = p as Record<string, unknown>;
  return (
    Number.isInteger(row) &&
    (row as number) >= 0 &&
    (row as number) < BOARD_SIZE &&
    Number.isInteger(col) &&
    (col as number) >= 0 &&
    (col as number) < BOARD_SIZE
  );
}

/**
 * Runtime shape-check for a move arriving off the wire. The WebSocket carries
 * arbitrary attacker-controlled JSON; without this, a frame like `{type:'move',
 * move:{}}` would reach the reducer and throw on `move.from.row`, crashing the
 * whole shared server. Legality (is this move actually playable?) is still the
 * reducer's job -- this only guarantees the object is well-formed enough to ask.
 */
export function isValidMove(move: unknown): move is Move {
  if (!move || typeof move !== 'object') return false;
  const { from, to, captured } = move as Record<string, unknown>;
  if (!isPosition(from) || !isPosition(to)) return false;
  return captured === undefined || isPosition(captured);
}

/**
 * The authoritative logic of one shared online match, with zero networking --
 * seat assignment, turn-gated move application, reset, and presence. Generic over
 * an opaque `Client` identity (a WebSocket in the server, a string in tests) so
 * it can be unit-tested without a socket. The server (server/index.ts) is a thin
 * adapter: it maps socket events onto these methods and broadcasts whenever one
 * reports a change.
 */
export class GameRoom<Client> {
  private game: GameState = createInitialState();
  private seats: Record<PieceColor, Client | null> = { red: null, black: null };
  private chatLog: ChatMessage[] = [];
  private nextChatId = 1;

  get state(): GameState {
    return this.game;
  }

  presence(): PlayerPresence {
    return { red: this.seats.red !== null, black: this.seats.black !== null };
  }

  private seatColor(client: Client): PieceColor | null {
    if (this.seats.red === client) return 'red';
    if (this.seats.black === client) return 'black';
    return null;
  }

  /** A connected client is a seated color, or a spectator otherwise. */
  private roleFor(client: Client): Role {
    return this.seatColor(client) ?? 'spectator';
  }

  /** The recent chat history, oldest first -- replayed to a client on connect. */
  chatHistory(): ChatMessage[] {
    return [...this.chatLog];
  }

  /**
   * Records a chat line from `client`, tagged with their current role. Rejects
   * (returns null, nothing recorded) non-string, empty, or whitespace-only text;
   * longer text is truncated to MAX_CHAT_LENGTH. The client JSON is untrusted, so
   * this must never throw. Returns the stored message to broadcast on success.
   */
  chat(client: Client, text: unknown): ChatMessage | null {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    const message: ChatMessage = {
      id: this.nextChatId++,
      from: this.roleFor(client),
      text: trimmed.slice(0, MAX_CHAT_LENGTH),
    };
    this.chatLog.push(message);
    if (this.chatLog.length > CHAT_HISTORY_LIMIT) this.chatLog.shift();
    return message;
  }

  /** Seats a newly-connected client: Red if free, else Black, else spectator. */
  join(client: Client): Role {
    if (this.seats.red === null) {
      this.seats.red = client;
      return 'red';
    }
    if (this.seats.black === null) {
      this.seats.black = client;
      return 'black';
    }
    return 'spectator';
  }

  /**
   * Releases a client's seat (if any). When both seats empty out AND the game is
   * already over, the board is reset so the next pair starts clean. An
   * *in-progress* game is deliberately preserved: if both players drop briefly
   * (a shared-router blip, both screens sleeping), wiping the position would
   * destroy a live match -- instead it's kept so a reconnecting client resumes it.
   */
  leave(client: Client): void {
    if (this.seats.red === client) this.seats.red = null;
    else if (this.seats.black === client) this.seats.black = null;
    const empty = this.seats.red === null && this.seats.black === null;
    if (empty && this.game.status.type !== 'in-progress') this.game = createInitialState();
  }

  /**
   * Applies `move` on behalf of `client`. Rejected (returns false, no change)
   * unless the client holds the seat whose turn it is AND the move is legal --
   * gameReducer re-validates legality, returning the same state reference for an
   * illegal move. Returns true iff the game state actually advanced.
   */
  move(client: Client, move: unknown): boolean {
    const color = this.seatColor(client);
    if (color === null || color !== this.game.currentPlayer) return false;
    if (!isValidMove(move)) return false; // reject malformed frames before the reducer
    const next = gameReducer(this.game, { type: 'PLAY_MOVE', move });
    if (next === this.game) return false;
    this.game = next;
    return true;
  }

  /** Resets the shared board to a new game. Only a seated player may do this. */
  reset(client: Client): boolean {
    if (this.seatColor(client) === null) return false;
    this.game = createInitialState();
    return true;
  }
}
