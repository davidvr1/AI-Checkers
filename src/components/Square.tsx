import type { Piece as PieceModel } from '../game/types';
import { Piece } from './Piece';

interface SquareProps {
  isDark: boolean;
  piece: PieceModel | null;
  isSelected: boolean;
  isLegalDestination: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function Square({ isDark, piece, isSelected, isLegalDestination, disabled, onClick }: SquareProps) {
  const classes = ['sq', isDark ? 'dark' : 'light', isSelected ? 'selected' : '']
    .filter(Boolean)
    .join(' ');

  const activate = () => {
    if (disabled) return;
    onClick();
  };

  return (
    <div
      className={classes}
      role="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      {piece && <Piece piece={piece} />}
      {!piece && isLegalDestination && <div className="dot" />}
    </div>
  );
}
