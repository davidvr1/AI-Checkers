import { useState } from 'react';
import { Board } from './Board';
import { Chat } from './Chat';
import { Fireworks } from './Fireworks';
import { StatusBar } from './StatusBar';
import { VideoPanel } from './VideoPanel';
import { useLang } from '../i18n';
import { useOnlineGame } from '../net/useOnlineGame';
import { useVideo } from '../net/useVideo';

interface OnlineGameScreenProps {
  /** The private game code this screen is connected to. */
  code: string;
  onNewGame: () => void;
}

/**
 * The "Play Online" screen. All game state comes from the server via
 * useOnlineGame; this component only renders it and forwards clicks. A banner
 * above the board carries the online-specific status (connecting, waiting for an
 * opponent, whose turn, spectating, connection lost) that the shared StatusBar
 * doesn't cover.
 */
export function OnlineGameScreen({ code, onNewGame }: OnlineGameScreenProps) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const {
    status,
    role,
    state,
    players,
    selected,
    myTurn,
    pending,
    chat,
    onSelectSquare,
    sendChat,
    reset,
    sendSignal,
    onSignal,
  } = useOnlineGame(code);

  const bothPresent = players.red && players.black;
  const video = useVideo({ role, opponentPresent: bothPresent, status, sendSignal, onSignal });
  const seated = role === 'red' || role === 'black';

  let banner: string;
  if (status === 'closed') banner = t.online.connectionLost;
  else if (!state || status === 'connecting') banner = t.online.connecting;
  else if (role === 'spectator') banner = t.online.spectating;
  else if (!bothPresent) banner = t.online.waitingForOpponent;
  else if (state.status.type === 'in-progress') banner = myTurn ? t.online.yourTurn : t.online.opponentTurn;
  else banner = ''; // game over -- the StatusBar shows the result

  const opponentLabel = seated && role ? t.online.youArePlaying(t.colors[role]) : t.online.eyebrow;

  // Only the player who actually won gets the fireworks -- not the loser, and not
  // spectators.
  const celebrate = state?.status.type === 'won' && state.status.winner === role;

  return (
    <>
      <Fireworks active={celebrate} />
      <div className="masthead">
        <span className="eyebrow">{t.online.eyebrow}</span>
        <h1>{t.appTitle}</h1>
        {banner && <p className={`online-banner${status === 'closed' ? ' error' : ''}`}>{banner}</p>}

        {/* The private code + a one-click shareable link for the opponent. */}
        <div className="game-code">
          <span className="game-code-label">{t.online.gameCode}</span>
          <span className="game-code-value">{code}</span>
          <button
            type="button"
            className="game-code-copy"
            onClick={async () => {
              const link = `${location.origin}${location.pathname}?g=${encodeURIComponent(code)}`;
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked -- the code is shown above to share manually */
              }
            }}
          >
            {copied ? t.online.copied : t.online.copyLink}
          </button>
        </div>

        <div className="online-actions">
          {seated && state && state.status.type !== 'in-progress' && (
            <button type="button" className="setup-start rematch" onClick={reset}>
              {t.online.rematch}
            </button>
          )}
          <button type="button" className="new-game" onClick={onNewGame}>
            {t.masthead.newGameButton}
          </button>
        </div>
      </div>

      <div className="program">
        {/* Video + chat on one side of the board; the scoreboard rail on the other. */}
        <div className="side">
          <VideoPanel video={video} />
          <Chat messages={chat} onSend={sendChat} ownRole={role} disabled={status !== 'open'} />
        </div>

        {/* Board pinned LTR so it never mirrors under Hebrew RTL. Rendered from the
            server's authoritative state, with this client's local selection injected
            for highlighting. Disabled unless it is genuinely this client's turn. */}
        <div className="board-card" dir="ltr">
          {state ? (
            <Board
              state={{ ...state, selected }}
              onSelectSquare={onSelectSquare}
              disabled={!myTurn || pending}
            />
          ) : (
            <div className="board-placeholder">
              {status === 'closed' ? t.online.connectionLost : t.online.connecting}
            </div>
          )}
        </div>

        <div className="side">
          {/* aiThinking stays false here -- it would mislabel the human opponent as
              "AI is thinking". The online banner already conveys whose turn it is. */}
          {state && <StatusBar state={state} opponentLabel={opponentLabel} aiThinking={false} />}
        </div>
      </div>
    </>
  );
}
