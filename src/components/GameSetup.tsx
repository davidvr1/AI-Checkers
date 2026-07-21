import { useState } from 'react';
import { capitalize } from '../format';
import type { Difficulty, GameConfig, GameMode, PieceColor } from '../game/types';

interface GameSetupProps {
  onStart: (config: GameConfig) => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const COLORS: PieceColor[] = ['red', 'black'];

export function GameSetup({ onStart }: GameSetupProps) {
  const [mode, setMode] = useState<GameMode>('human');
  const [humanColor, setHumanColor] = useState<PieceColor>('red');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const handleStart = () => {
    onStart(mode === 'human' ? { mode: 'human' } : { mode: 'ai', humanColor, difficulty });
  };

  return (
    <div className="setup">
      <div className="masthead">
        <span className="eyebrow">New game</span>
        <h1>Checkers, on the web</h1>
        <p className="sub">
          Standard American draughts rules: captures are mandatory, multi-jumps chain
          automatically, and a forced single move plays itself.
        </p>
      </div>

      <div className="setup-card">
        <div className="setup-group">
          <span className="setup-label" id="mode-label">Mode</span>
          <div className="setup-options" role="group" aria-labelledby="mode-label">
            <button
              type="button"
              aria-pressed={mode === 'human'}
              className={`setup-option ${mode === 'human' ? 'active' : ''}`}
              onClick={() => setMode('human')}
            >
              vs Human
            </button>
            <button
              type="button"
              aria-pressed={mode === 'ai'}
              className={`setup-option ${mode === 'ai' ? 'active' : ''}`}
              onClick={() => setMode('ai')}
            >
              vs AI
            </button>
          </div>
        </div>

        {mode === 'ai' && (
          <>
            <div className="setup-group">
              <span className="setup-label" id="color-label">Your color</span>
              <div className="setup-options" role="group" aria-labelledby="color-label">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-pressed={humanColor === color}
                    className={`setup-option ${humanColor === color ? 'active' : ''}`}
                    onClick={() => setHumanColor(color)}
                  >
                    {capitalize(color)}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-group">
              <span className="setup-label" id="difficulty-label">Difficulty</span>
              <div className="setup-options" role="group" aria-labelledby="difficulty-label">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={difficulty === level}
                    className={`setup-option ${difficulty === level ? 'active' : ''}`}
                    onClick={() => setDifficulty(level)}
                  >
                    {capitalize(level)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <button type="button" className="setup-start" onClick={handleStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}
