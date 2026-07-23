import { DRAW_TURN_LIMIT } from '../game/gameReducer';
import type { GameState } from '../game/types';
import { useLang } from '../i18n';

interface StatusBarProps {
  state: GameState;
  /** e.g. "vs Human" or "vs AI · Medium" -- shown above the turn indicator. */
  opponentLabel?: string;
  /** True while the AI is computing its move for the current turn. */
  aiThinking?: boolean;
}

export function StatusBar({ state, opponentLabel, aiThinking }: StatusBarProps) {
  const { t } = useLang();
  const { status, currentPlayer, capturedCount, turnsSinceCapture } = state;

  let swatchClass: 'red' | 'black' | 'neutral' = currentPlayer;
  let turnLabel = t.status.toMove;
  let turnValue = t.colors[currentPlayer];

  if (status.type === 'won') {
    swatchClass = status.winner;
    turnLabel = t.status.gameOver;
    turnValue = t.status.wins(t.colors[status.winner]);
  } else if (status.type === 'draw') {
    swatchClass = 'neutral';
    turnLabel = t.status.gameOver;
    turnValue = t.status.draw;
  } else if (aiThinking) {
    turnLabel = t.status.aiThinking;
    turnValue = `${t.colors[currentPlayer]}…`;
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
            {t.status.redCaptured}
          </span>
          <span className="n">{capturedCount.red}</span>
        </div>
        <div className="tally-row">
          <span className="label">
            <span className="dot-key black" />
            {t.status.blackCaptured}
          </span>
          <span className="n">{capturedCount.black}</span>
        </div>
        <div className="tally-row">
          <span className="label">{t.status.turnsSinceCapture}</span>
          <span className="n" dir="ltr">
            {turnsSinceCapture} / {DRAW_TURN_LIMIT}
          </span>
        </div>
      </div>

      <hr className="rule" />

      <div className="legend">
        <div className="legend-item">
          <span className="legend-swatch ring" /> {t.status.selectedPiece}
        </div>
        <div className="legend-item">
          <span className="legend-swatch moveto">
            <span className="inner" />
          </span>{' '}
          {t.status.legalDestination}
        </div>
      </div>
    </div>
  );
}
