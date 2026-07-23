import type { GameState, Move, PieceColor } from '../game/types';

/** WebSocket path the game server listens on (same host/port as the served app). */
export const WS_PATH = '/ws';

/** A connected client is one of the two players, or a spectator if both seats are taken. */
export type Role = PieceColor | 'spectator';

/** Which player seats are currently occupied. */
export interface PlayerPresence {
  red: boolean;
  black: boolean;
}

/** One chat line: who sent it (by role) and what they said. `id` is a server
 * monotonic counter, used as a stable React key and to order messages. */
export interface ChatMessage {
  id: number;
  from: Role;
  text: string;
}

/** Messages the browser sends to the server. */
export type ClientMessage =
  | { type: 'move'; move: Move }
  | { type: 'reset' }
  | { type: 'chat'; text: string };

/**
 * Messages the server sends to the browser. `welcome` arrives once on connect and
 * fixes this client's role; `sync` carries the full authoritative game state plus
 * seat presence and is re-sent on every change (a move, a reset, or a player
 * joining/leaving). The server is the single source of truth -- clients render
 * `sync.state` and never advance the game locally.
 */
export type ServerMessage =
  | { type: 'welcome'; role: Role }
  | { type: 'sync'; state: GameState; players: PlayerPresence }
  // Carries the recent history on connect, then one appended message per chat.
  // The client appends `messages` in both cases.
  | { type: 'chat'; messages: ChatMessage[] };
