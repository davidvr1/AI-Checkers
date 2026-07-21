import { useMemo } from 'react';
import { isDarkSquare, samePosition } from '../game/board';
import { currentLegalMoves } from '../game/gameReducer';
import type { GameState, Position } from '../game/types';
import { Square } from './Square';

interface BoardProps {
  state: GameState;
  onSelectSquare: (position: Position) => void;
}

export function Board({ state, onSelectSquare }: BoardProps) {
  const activeFrom = state.mustContinueFrom ?? state.selected;

  const destinations = useMemo(() => {
    if (!activeFrom) return [];
    return currentLegalMoves(state)
      .filter((move) => samePosition(move.from, activeFrom))
      .map((move) => move.to);
  }, [state]);

  const rows = Array.from({ length: 8 }, (_, row) => row);
  const cols = Array.from({ length: 8 }, (_, col) => col);

  return (
    <div className="board">
      {rows.map((row) =>
        cols.map((col) => {
          const position: Position = { row, col };
          const piece = state.board[row][col];
          return (
            <Square
              key={`${row}-${col}`}
              isDark={isDarkSquare(position)}
              piece={piece}
              isSelected={activeFrom !== null && samePosition(activeFrom, position)}
              isLegalDestination={destinations.some((dest) => samePosition(dest, position))}
              onClick={() => onSelectSquare(position)}
            />
          );
        }),
      )}
    </div>
  );
}
