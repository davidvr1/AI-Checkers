import { useEffect, useReducer, useRef, useState } from 'react';
import { chooseAiMove, DIFFICULTY_DEPTH } from './ai/minimax';
import { Board } from './components/Board';
import { GameSetup } from './components/GameSetup';
import { LanguageToggle } from './components/LanguageToggle';
import { OnlineGameScreen } from './components/OnlineGameScreen';
import { StatusBar } from './components/StatusBar';
import { createInitialState, gameReducer } from './game/gameReducer';
import { formatLogEntry } from './game/moveLog';
import type { GameConfig, MoveLogEntry, PieceColor, Position } from './game/types';
import { useLang } from './i18n';

/** A short pause before the AI actually computes, so "AI is thinking" reads as real
 * even on a forced move where there's nothing to search. */
const AI_THINK_DELAY_MS = 400;

declare global {
  interface Window {
    __checkersMoveLog?: MoveLogEntry[];
  }
}

interface GameScreenProps {
  /** Local (human or AI) game only -- the online mode has its own screen. */
  config: Exclude<GameConfig, { mode: 'online' }>;
  onNewGame: () => void;
}

function GameScreen({ config, onNewGame }: GameScreenProps) {
  const { t } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  const aiConfig = config.mode === 'ai' ? config : null;
  const aiColor: PieceColor | null = aiConfig ? (aiConfig.humanColor === 'red' ? 'black' : 'red') : null;
  const isAiTurn = aiColor !== null && state.status.type === 'in-progress' && state.currentPlayer === aiColor;

  // Each fresh game starts its own window-visible log -- a previous game's
  // entries shouldn't linger and mix into this one's audit trail.
  useEffect(() => {
    window.__checkersMoveLog = [];
  }, []);

  // Prints each newly-committed move (and why any piece was removed) to the
  // console and accumulates it on window.__checkersMoveLog for later audit --
  // e.g. checking that no illogical move slipped through. Keyed off history's
  // length (not the dispatch itself) so it only ever fires once per real,
  // committed move -- immune to React StrictMode's dev-only double-invocation
  // of the reducer, and to the AI's internal search, which never touches this
  // component's committed state at all.
  const loggedCountRef = useRef(0);
  useEffect(() => {
    for (let i = loggedCountRef.current; i < state.history.length; i++) {
      const entry = state.history[i];
      // eslint-disable-next-line no-console
      console.log(`[checkers] ${formatLogEntry(entry)}`);
      window.__checkersMoveLog?.push(entry);
    }
    loggedCountRef.current = state.history.length;
  }, [state.history]);

  useEffect(() => {
    if (!aiConfig || !isAiTurn) return;
    // No auto-play: the AI always goes through the same visible thinking pause and
    // PLAY_MOVE dispatch, even when currentLegalMoves has exactly one option --
    // chooseAiMove's own length===1 fast path skips the search, but the turn is
    // still an explicit, visible action rather than a silent skip.

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const move = chooseAiMove(state, DIFFICULTY_DEPTH[aiConfig.difficulty]);
      dispatch({ type: 'PLAY_MOVE', move });
    }, AI_THINK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, isAiTurn, aiConfig]);

  const handleSelectSquare = (position: Position) => {
    if (isAiTurn) return;
    dispatch({ type: 'SELECT_SQUARE', position });
  };

  const opponentLabel =
    config.mode === 'human' ? t.status.vsHuman : t.status.vsAiWith(t.difficulties[config.difficulty]);

  return (
    <>
      <div className="masthead">
        <span className="eyebrow">
          {config.mode === 'human' ? t.masthead.localTwoPlayer : t.masthead.humanVsAi}
        </span>
        <h1>{t.appTitle}</h1>
        <p className="sub">{t.rulesBlurb}</p>
        <button type="button" className="new-game" onClick={onNewGame}>
          {t.masthead.newGameButton}
        </button>
      </div>

      <div className="program">
        {/* Board is pinned LTR so its 8x8 grid never mirrors under Hebrew RTL --
            piece colors stay on the same sides regardless of UI language. */}
        <div className="board-card" dir="ltr">
          <Board state={state} onSelectSquare={handleSelectSquare} disabled={isAiTurn} />
        </div>
        <StatusBar state={state} opponentLabel={opponentLabel} aiThinking={isAiTurn} />
      </div>
    </>
  );
}

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);

  const onNewGame = () => setConfig(null);

  return (
    <>
      <LanguageToggle />
      {config === null ? (
        <GameSetup onStart={setConfig} />
      ) : config.mode === 'online' ? (
        <OnlineGameScreen onNewGame={onNewGame} />
      ) : (
        <GameScreen config={config} onNewGame={onNewGame} />
      )}
    </>
  );
}
