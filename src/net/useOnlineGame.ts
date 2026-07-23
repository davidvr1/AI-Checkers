import { useCallback, useEffect, useRef, useState } from 'react';
import { getPiece, samePosition } from '../game/board';
import { getAllLegalMoves, pieceCaptureMoves } from '../game/rules';
import type { GameState, Move, Position } from '../game/types';
import { WS_PATH, type ClientMessage, type PlayerPresence, type Role, type ServerMessage } from './protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface OnlineGame {
  status: ConnectionStatus;
  role: Role | null;
  state: GameState | null;
  players: PlayerPresence;
  /** The square this client has locally selected (never sent to the server until it forms a move). */
  selected: Position | null;
  /** True when it is this client's turn to act, both seats are filled, and the socket is live. */
  myTurn: boolean;
  /** True briefly after sending a move, until the server's next sync confirms it. */
  pending: boolean;
  onSelectSquare: (position: Position) => void;
  reset: () => void;
}

/** Longest backoff between reconnect attempts (ms). */
const MAX_RECONNECT_MS = 8000;
/** Failsafe that clears a stuck `pending` if a sync never arrives (ms). */
const PENDING_TIMEOUT_MS = 2000;

/**
 * Resolves a board click against the authoritative server state into either a
 * move to send or a new local selection. Mirrors the local reducer's
 * click-to-select/click-to-move semantics, but produces a `Move` for the server
 * instead of mutating state -- the server stays the single source of truth.
 */
function resolveClick(
  state: GameState,
  selected: Position | null,
  position: Position,
): { move?: Move; nextSelected: Position | null } {
  if (state.mustContinueFrom) {
    const moves = pieceCaptureMoves(state.board, state.mustContinueFrom, state.currentPlayer);
    const move = moves.find((m) => samePosition(m.to, position));
    return move ? { move, nextSelected: state.mustContinueFrom } : { nextSelected: state.mustContinueFrom };
  }

  const legal = getAllLegalMoves(state.board, state.currentPlayer);

  if (selected) {
    if (samePosition(selected, position)) return { nextSelected: null }; // toggle off
    const move = legal.find((m) => samePosition(m.from, selected) && samePosition(m.to, position));
    if (move) return { move, nextSelected: null };
  }

  const piece = getPiece(state.board, position);
  const isOwnMovable =
    piece?.color === state.currentPlayer && legal.some((m) => samePosition(m.from, position));
  if (isOwnMovable) return { nextSelected: position };

  return { nextSelected: null }; // clicked empty/opponent/immovable -> clear any selection
}

/**
 * Connects to the game server that served this page (same host/port) and drives
 * one shared, server-authoritative match. The board is rendered from `state`
 * (the server's latest broadcast); local clicks are resolved into moves and sent
 * on, never applied locally. Reconnects automatically (with backoff) so a brief
 * mobile WiFi drop resumes the game rather than ending it.
 */
export function useOnlineGame(): OnlineGame {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [role, setRole] = useState<Role | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerPresence>({ red: false, black: false });
  const [selected, setSelected] = useState<Position | null>(null);
  const [pending, setPending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`;
    let unmounted = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (unmounted) return;
      setStatus('connecting');
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setStatus('open');
      };
      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === 'welcome') {
          setRole(message.role); // re-fixed on every (re)connection, so it can't go stale
        } else if (message.type === 'sync') {
          setState(message.state);
          setPlayers(message.players);
          setPending(false); // the server responded; unlock input
        }
      };
      socket.onerror = () => socket.close(); // fall through to onclose's retry
      socket.onclose = () => {
        if (unmounted) return;
        setStatus('closed');
        const delay = Math.min(1000 * 2 ** attempts, MAX_RECONNECT_MS);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const bothPresent = players.red && players.black;
  const myTurn =
    status === 'open' &&
    state !== null &&
    (role === 'red' || role === 'black') &&
    role === state.currentPlayer &&
    state.status.type === 'in-progress' &&
    bothPresent;

  // Keep local selection pinned to a forced-continuation square, and cleared when
  // it stops being this client's turn.
  useEffect(() => {
    if (!myTurn) setSelected(state?.mustContinueFrom ?? null);
    else if (state?.mustContinueFrom) setSelected(state.mustContinueFrom);
  }, [myTurn, state?.mustContinueFrom]);

  const onSelectSquare = useCallback(
    (position: Position) => {
      if (!myTurn || pending || !state) return;
      const { move, nextSelected } = resolveClick(state, selected, position);
      setSelected(nextSelected);
      if (move) {
        send({ type: 'move', move });
        // Lock input until the server's sync lands, so fast multi-jump clicks
        // aren't resolved against a pre-move board. Failsafe-cleared in case a
        // rejected move never produces a sync.
        setPending(true);
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(() => setPending(false), PENDING_TIMEOUT_MS);
      }
    },
    [myTurn, pending, state, selected, send],
  );

  const reset = useCallback(() => send({ type: 'reset' }), [send]);

  return { status, role, state, players, selected, myTurn, pending, onSelectSquare, reset };
}
