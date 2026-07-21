import type { Piece as PieceModel } from '../game/types';

interface PieceProps {
  piece: PieceModel;
}

export function Piece({ piece }: PieceProps) {
  const isKing = piece.kind === 'king';
  return (
    <div className={`piece ${piece.color}${isKing ? ' king' : ''}`}>
      {isKing && <span className="crown">♛</span>}
    </div>
  );
}
