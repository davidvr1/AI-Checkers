import { describe, expect, it } from 'vitest';
import { GameRoom } from './gameRoom';
import type { Move } from '../game/types';

// String client ids stand in for sockets. Red's standard opening move.
const RED_OPEN: Move = { from: { row: 5, col: 0 }, to: { row: 4, col: 1 } };
const BLACK_REPLY: Move = { from: { row: 2, col: 1 }, to: { row: 3, col: 0 } };

describe('GameRoom: seating', () => {
  it('assigns Red to the first client, Black to the second, spectator after', () => {
    const room = new GameRoom<string>();
    expect(room.join('a')).toBe('red');
    expect(room.join('b')).toBe('black');
    expect(room.join('c')).toBe('spectator');
    expect(room.presence()).toEqual({ red: true, black: true });
  });

  it('frees a seat on leave so the next joiner can take it', () => {
    const room = new GameRoom<string>();
    room.join('a'); // red
    room.join('b'); // black
    room.leave('a');
    expect(room.presence()).toEqual({ red: false, black: true });
    expect(room.join('c')).toBe('red'); // reclaims the freed Red seat
  });

  it('preserves an in-progress game when both seats empty, rather than wiping a live match', () => {
    const room = new GameRoom<string>();
    room.join('a');
    room.join('b');
    expect(room.move('a', RED_OPEN)).toBe(true); // an in-progress game
    expect(room.state.board[4][1]).not.toBeNull();

    room.leave('a');
    room.leave('b');
    // Both gone mid-game (e.g. a double network blip): the position is kept so a
    // reconnecting player resumes it, NOT reset out from under them.
    expect(room.state.board[4][1]).toEqual({ color: 'red', kind: 'man' });
    expect(room.state.currentPlayer).toBe('black');
  });
});

describe('GameRoom: move gating', () => {
  it('applies a legal move from the player whose turn it is and advances the turn', () => {
    const room = new GameRoom<string>();
    room.join('a'); // red
    room.join('b'); // black
    expect(room.move('a', RED_OPEN)).toBe(true);
    expect(room.state.currentPlayer).toBe('black');
    expect(room.state.board[4][1]).toEqual({ color: 'red', kind: 'man' });
  });

  it("rejects a move from the player whose turn it is NOT", () => {
    const room = new GameRoom<string>();
    room.join('a'); // red
    room.join('b'); // black
    // It's Red's turn; Black attempts a move.
    expect(room.move('b', BLACK_REPLY)).toBe(false);
    expect(room.state.currentPlayer).toBe('red'); // unchanged
  });

  it('rejects a move from a spectator', () => {
    const room = new GameRoom<string>();
    room.join('a');
    room.join('b');
    room.join('c'); // spectator
    expect(room.move('c', RED_OPEN)).toBe(false);
  });

  it('rejects an illegal move without changing state', () => {
    const room = new GameRoom<string>();
    room.join('a'); // red
    room.join('b');
    const illegal: Move = { from: { row: 5, col: 0 }, to: { row: 0, col: 0 } };
    expect(room.move('a', illegal)).toBe(false);
    expect(room.state.board[5][0]).not.toBeNull(); // still there
  });

  it('rejects a malformed move frame without throwing (crash-proof trust boundary)', () => {
    const room = new GameRoom<string>();
    room.join('a'); // red, whose turn it is
    room.join('b');
    // Each of these would dereference undefined inside the reducer if it slipped through.
    expect(room.move('a', {})).toBe(false);
    expect(room.move('a', { from: null, to: null })).toBe(false);
    expect(room.move('a', { from: { row: 5, col: 0 } })).toBe(false); // missing `to`
    expect(room.move('a', 'not-an-object')).toBe(false);
    expect(room.move('a', { from: { row: 9, col: 0 }, to: { row: 4, col: 1 } })).toBe(false); // off-board
    expect(room.move('a', { from: { row: 5.5, col: 0 }, to: { row: 4, col: 1 } })).toBe(false); // non-integer
    expect(room.state.currentPlayer).toBe('red'); // untouched, no crash
  });

  it('lets Red then Black each move in turn', () => {
    const room = new GameRoom<string>();
    room.join('a');
    room.join('b');
    expect(room.move('a', RED_OPEN)).toBe(true);
    expect(room.move('b', BLACK_REPLY)).toBe(true);
    expect(room.state.currentPlayer).toBe('red');
    expect(room.state.board[3][0]).toEqual({ color: 'black', kind: 'man' });
  });
});

describe('GameRoom: reset', () => {
  it('lets a seated player reset the shared board', () => {
    const room = new GameRoom<string>();
    room.join('a');
    room.join('b');
    room.move('a', RED_OPEN);
    expect(room.reset('a')).toBe(true);
    expect(room.state.board[4][1]).toBeNull();
    expect(room.state.board[5][0]).not.toBeNull();
    expect(room.state.currentPlayer).toBe('red');
  });

  it('does not let a spectator reset', () => {
    const room = new GameRoom<string>();
    room.join('a');
    room.join('b');
    room.move('a', RED_OPEN);
    room.join('c'); // spectator
    expect(room.reset('c')).toBe(false);
    expect(room.state.board[4][1]).not.toBeNull(); // still mid-game
  });
});
