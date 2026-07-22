import { useEffect, useReducer, useState } from 'react';
import { chooseAiMove, DIFFICULTY_DEPTH } from './ai/minimax';
import { Board } from './components/Board';
import { GameSetup } from './components/GameSetup';
import { StatusBar } from './components/StatusBar';
import { capitalize } from './format';
import { createInitialState, gameReducer } from './game/gameReducer';
import type { GameConfig, PieceColor, Position } from './game/types';

/** A short pause before the AI actually computes, so "AI is thinking" reads as real
 * even on a forced move where there's nothing to search. */
const AI_THINK_DELAY_MS = 400;

interface GameScreenProps {
  config: GameConfig;
  onNewGame: () => void;
}

function GameScreen({ config, onNewGame }: GameScreenProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  const aiConfig = config.mode === 'ai' ? config : null;
  const aiColor: PieceColor | null = aiConfig ? (aiConfig.humanColor === 'red' ? 'black' : 'red') : null;
  const isAiTurn = aiColor !== null && state.status.type === 'in-progress' && state.currentPlayer === aiColor;

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
    config.mode === 'human' ? 'vs Human' : `vs AI · ${capitalize(config.difficulty)}`;

  return (
    <>
      <div className="masthead">
        <span className="eyebrow">{config.mode === 'human' ? 'Local two-player' : 'Human vs AI'}</span>
        <h1>Checkers, on the web</h1>
        <p className="sub">
          Standard American draughts rules: captures are mandatory and multi-jumps
          chain -- click through every move, even a forced one.
        </p>
        <button type="button" className="new-game" onClick={onNewGame}>
          New Game
        </button>
      </div>

      <div className="program">
        <div className="board-card">
          <Board state={state} onSelectSquare={handleSelectSquare} disabled={isAiTurn} />
        </div>
        <StatusBar state={state} opponentLabel={opponentLabel} aiThinking={isAiTurn} />
      </div>
    </>
  );
}

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);

  if (!config) {
    return <GameSetup onStart={setConfig} />;
  }

  return <GameScreen config={config} onNewGame={() => setConfig(null)} />;
}
