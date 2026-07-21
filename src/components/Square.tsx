import type { Piece as PieceModel } from '../game/types';
import { Piece } from './Piece';

interface SquareProps {
  isDark: boolean;
  piece: PieceModel | null;
  isSelected: boolean;
  isLegalDestination: boolean;
  onClick: () => void;
}

export function Square({ isDark, piece, isSelected, isLegalDestination, onClick }: SquareProps) {
  const classes = ['sq', isDark ? 'dark' : 'light', isSelected ? 'selected' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {piece && <Piece piece={piece} />}
      {!piece && isLegalDestination && <div className="dot" />}
    </div>
  );
}
