import { useMemo } from 'react';
import { isDarkSquare, lastTurnSquares, samePosition } from '../game/board';
import { currentLegalMoves } from '../game/gameReducer';
import type { GameState, Position } from '../game/types';
import { Square } from './Square';

interface BoardProps {
  state: GameState;
  onSelectSquare: (position: Position) => void;
  disabled?: boolean;
}

export function Board({ state, onSelectSquare, disabled }: BoardProps) {
  // While disabled (the AI's turn), selection/destination highlighting is
  // suppressed -- otherwise the AI's own forced-continuation piece would be
  // shown to the human with the same "you can act on this" visual language.
  const activeFrom = disabled ? null : state.mustContinueFrom ?? state.selected;

  const destinations = useMemo(() => {
    if (!activeFrom) return [];
    return currentLegalMoves(state)
      .filter((move) => samePosition(move.from, activeFrom))
      .map((move) => move.to);
  }, [state, activeFrom]);

  // Highlight the last move's from/to squares -- shown regardless of `disabled`,
  // since its whole point is to reveal what the opponent (or AI) just played.
  const lastMove = useMemo(() => lastTurnSquares(state.history), [state.history]);

  const rows = Array.from({ length: 8 }, (_, row) => row);
  const cols = Array.from({ length: 8 }, (_, col) => col);

  return (
    <div className={`board${disabled ? ' disabled' : ''}`}>
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
              isLastMove={
                lastMove !== null &&
                (samePosition(lastMove.from, position) || samePosition(lastMove.to, position))
              }
              disabled={disabled}
              onClick={() => onSelectSquare(position)}
            />
          );
        }),
      )}
    </div>
  );
}
