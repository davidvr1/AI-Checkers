import { describe, expect, it } from 'vitest';
import { lastTurnSquares } from './board';
import type { MoveLogEntry, PieceColor, Position } from './types';

function entry(player: PieceColor, from: Position, to: Position): MoveLogEntry {
  return {
    index: 0,
    player,
    piece: { color: player, kind: 'man' },
    from,
    to,
    promoted: false,
    resultingStatus: { type: 'in-progress' },
  };
}

describe('lastTurnSquares', () => {
  it('returns null before any move', () => {
    expect(lastTurnSquares([])).toBeNull();
  });

  it('returns the from/to of a single last move', () => {
    const history = [
      entry('red', { row: 5, col: 0 }, { row: 4, col: 1 }),
      entry('black', { row: 2, col: 1 }, { row: 3, col: 0 }),
    ];
    expect(lastTurnSquares(history)).toEqual({ from: { row: 2, col: 1 }, to: { row: 3, col: 0 } });
  });

  it('collapses a multi-jump turn to its origin and final landing', () => {
    // Red plays a two-leg chain: (4,4)->(2,2)->(0,0), all same turn (same player).
    const history = [
      entry('black', { row: 2, col: 1 }, { row: 3, col: 0 }),
      entry('red', { row: 4, col: 4 }, { row: 2, col: 2 }), // leg 1
      entry('red', { row: 2, col: 2 }, { row: 0, col: 0 }), // leg 2 (same turn)
    ];
    expect(lastTurnSquares(history)).toEqual({ from: { row: 4, col: 4 }, to: { row: 0, col: 0 } });
  });

  it('does not merge two separate turns by the same color across an opponent move', () => {
    const history = [
      entry('red', { row: 5, col: 0 }, { row: 4, col: 1 }),
      entry('black', { row: 2, col: 1 }, { row: 3, col: 0 }),
      entry('red', { row: 4, col: 1 }, { row: 3, col: 2 }), // a later, separate red turn
    ];
    // Only the last red turn, not merged with the earlier red move.
    expect(lastTurnSquares(history)).toEqual({ from: { row: 4, col: 1 }, to: { row: 3, col: 2 } });
  });
});
