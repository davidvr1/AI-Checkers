import { useReducer } from 'react';
import { Board } from './components/Board';
import { StatusBar } from './components/StatusBar';
import { createInitialState, gameReducer, withAutoPlay } from './game/gameReducer';
import type { Position } from './game/types';

function init() {
  return withAutoPlay(createInitialState());
}

export function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, init);

  const handleSelectSquare = (position: Position) => {
    dispatch({ type: 'SELECT_SQUARE', position });
  };

  return (
    <>
      <div className="masthead">
        <span className="eyebrow">Local two-player</span>
        <h1>Checkers, on the web</h1>
        <p className="sub">
          Standard American draughts rules: captures are mandatory, multi-jumps chain
          automatically, and a forced single move plays itself.
        </p>
      </div>

      <div className="program">
        <div className="board-card">
          <Board state={state} onSelectSquare={handleSelectSquare} />
        </div>
        <StatusBar state={state} />
      </div>
    </>
  );
}
