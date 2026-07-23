import { useState } from 'react';
import { useLang } from '../i18n';
import type { Difficulty, GameConfig, GameMode, PieceColor } from '../game/types';

interface GameSetupProps {
  onStart: (config: GameConfig) => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const COLORS: PieceColor[] = ['red', 'black'];

/** A shared link may carry the game code as ?g=CODE -- prefill the join field from it. */
function codeFromUrl(): string {
  if (typeof location === 'undefined') return '';
  const raw = new URLSearchParams(location.search).get('g') ?? '';
  return raw.trim().toUpperCase();
}

export function GameSetup({ onStart }: GameSetupProps) {
  const { t } = useLang();
  const initialCode = codeFromUrl();
  // A link with ?g=CODE means "join this game" -- open straight on the online tab.
  const [mode, setMode] = useState<GameMode>(initialCode ? 'online' : 'human');
  const [humanColor, setHumanColor] = useState<PieceColor>('red');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [code, setCode] = useState(initialCode);
  const [creating, setCreating] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleStart = () => {
    if (mode === 'human') onStart({ mode: 'human' });
    else if (mode === 'ai') onStart({ mode: 'ai', humanColor, difficulty });
    else {
      // Online: join the typed/shared code.
      const trimmed = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(trimmed)) {
        setCodeError(t.setup.codeInvalid);
        return;
      }
      onStart({ mode: 'online', code: trimmed });
    }
  };

  /** Asks the server for a fresh unused code, then opens that game. */
  const handleCreate = async () => {
    setCodeError(null);
    setCreating(true);
    try {
      const response = await fetch('/api/new-code');
      if (!response.ok) throw new Error(String(response.status));
      const { code: fresh } = (await response.json()) as { code: string };
      onStart({ mode: 'online', code: fresh });
    } catch {
      setCodeError(t.setup.createFailed);
    } finally {
      setCreating(false);
    }
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
            <button
              type="button"
              aria-pressed={mode === 'online'}
              className={`setup-option ${mode === 'online' ? 'active' : ''}`}
              onClick={() => setMode('online')}
            >
              {t.setup.playOnline}
            </button>
          </div>
        </div>

        {mode === 'online' && (
          <>
            <p className="setup-hint">{t.setup.onlineHint}</p>
            <button type="button" className="setup-start" onClick={handleCreate} disabled={creating}>
              {creating ? t.setup.creating : t.setup.createGame}
            </button>
            <div className="setup-group">
              <span className="setup-label" id="code-label">{t.setup.joinGame}</span>
              <div className="setup-join">
                <input
                  type="text"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.toUpperCase());
                    setCodeError(null);
                  }}
                  placeholder={t.setup.codePlaceholder}
                  aria-labelledby="code-label"
                  maxLength={8}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {codeError && <p className="setup-error">{codeError}</p>}
            </div>
          </>
        )}

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

        {/* In online mode this button joins the entered code; "Create game" above
            starts a brand-new one. */}
        <button type="button" className="setup-start" onClick={handleStart}>
          {mode === 'online' ? t.setup.joinGame : t.setup.startGame}
        </button>
      </div>
    </div>
  );
}
