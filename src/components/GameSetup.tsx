import { useState } from 'react';
import { useLang } from '../i18n';
import type { Difficulty, GameConfig, GameMode, PieceColor } from '../game/types';

interface GameSetupProps {
  onStart: (config: GameConfig) => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const COLORS: PieceColor[] = ['red', 'black'];

export function GameSetup({ onStart }: GameSetupProps) {
  const { t } = useLang();
  const [mode, setMode] = useState<GameMode>('human');
  const [humanColor, setHumanColor] = useState<PieceColor>('red');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const handleStart = () => {
    onStart(mode === 'human' ? { mode: 'human' } : { mode: 'ai', humanColor, difficulty });
  };

  return (
    <div className="setup">
      <div className="masthead">
        <span className="eyebrow">{t.masthead.newGameEyebrow}</span>
        <h1>{t.appTitle}</h1>
        <p className="sub">{t.rulesBlurb}</p>
      </div>

      <div className="setup-card">
        <div className="setup-group">
          <span className="setup-label" id="mode-label">{t.setup.mode}</span>
          <div className="setup-options" role="group" aria-labelledby="mode-label">
            <button
              type="button"
              aria-pressed={mode === 'human'}
              className={`setup-option ${mode === 'human' ? 'active' : ''}`}
              onClick={() => setMode('human')}
            >
              {t.setup.vsHuman}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'ai'}
              className={`setup-option ${mode === 'ai' ? 'active' : ''}`}
              onClick={() => setMode('ai')}
            >
              {t.setup.vsAi}
            </button>
          </div>
        </div>

        {mode === 'ai' && (
          <>
            <div className="setup-group">
              <span className="setup-label" id="color-label">{t.setup.yourColor}</span>
              <div className="setup-options" role="group" aria-labelledby="color-label">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-pressed={humanColor === color}
                    className={`setup-option ${humanColor === color ? 'active' : ''}`}
                    onClick={() => setHumanColor(color)}
                  >
                    {t.colors[color]}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-group">
              <span className="setup-label" id="difficulty-label">{t.setup.difficulty}</span>
              <div className="setup-options" role="group" aria-labelledby="difficulty-label">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={difficulty === level}
                    className={`setup-option ${difficulty === level ? 'active' : ''}`}
                    onClick={() => setDifficulty(level)}
                  >
                    {t.difficulties[level]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <button type="button" className="setup-start" onClick={handleStart}>
          {t.setup.startGame}
        </button>
      </div>
    </div>
  );
}
