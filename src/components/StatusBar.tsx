import { capitalize } from '../format';
import { DRAW_TURN_LIMIT } from '../game/gameReducer';
import type { GameState } from '../game/types';

interface StatusBarProps {
  state: GameState;
  /** e.g. "vs Human" or "vs AI · Medium" -- shown above the turn indicator. */
  opponentLabel?: string;
  /** True while the AI is computing its move for the current turn. */
  aiThinking?: boolean;
}

export function StatusBar({ state, opponentLabel, aiThinking }: StatusBarProps) {
  const { status, currentPlayer, capturedCount, turnsSinceCapture } = state;

  let swatchClass: 'red' | 'black' | 'neutral' = currentPlayer;
  let turnLabel = 'To move';
  let turnValue = capitalize(currentPlayer);

  if (status.type === 'won') {
    swatchClass = status.winner;
    turnLabel = 'Game over';
    turnValue = `${capitalize(status.winner)} wins`;
  } else if (status.type === 'draw') {
    swatchClass = 'neutral';
    turnLabel = 'Game over';
    turnValue = 'Draw';
  } else if (aiThinking) {
    turnLabel = 'AI is thinking';
    turnValue = `${capitalize(currentPlayer)}…`;
  }

  return (
    <div className="rail">
      {opponentLabel && <div className="opponent-label">{opponentLabel}</div>}

      <div className="turn">
        <span className={`swatch ${swatchClass}${aiThinking ? ' thinking' : ''}`} />
        <span>
          <span className="turn-label">{turnLabel}</span>
          <span className="turn-value">{turnValue}</span>
        </span>
      </div>

      <hr className="rule" />

      <div className="tally">
        <div className="tally-row">
          <span className="label">
            <span className="dot-key red" />
            Red captured
          </span>
          <span className="n">{capturedCount.red}</span>
        </div>
        <div className="tally-row">
          <span className="label">
            <span className="dot-key black" />
            Black captured
          </span>
          <span className="n">{capturedCount.black}</span>
        </div>
        <div className="tally-row">
          <span className="label">Turns since capture</span>
          <span className="n">
            {turnsSinceCapture} / {DRAW_TURN_LIMIT}
          </span>
        </div>
      </div>

      <hr className="rule" />

      <div className="legend">
        <div className="legend-item">
          <span className="legend-swatch ring" /> Selected piece
        </div>
        <div className="legend-item">
          <span className="legend-swatch moveto">
            <span className="inner" />
          </span>{' '}
          Legal destination
        </div>
        <div className="legend-item">
          <span className="legend-swatch auto">1</span> Auto-played when it's the only legal move
        </div>
      </div>
    </div>
  );
}
