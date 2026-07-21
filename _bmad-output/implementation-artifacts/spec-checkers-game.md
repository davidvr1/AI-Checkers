---
title: 'Playable Checkers Game (Human vs Human)'
type: 'feature'
created: '2026-07-21'
status: 'ready-for-dev'
review_loop_iteration: 0
context: ['{project-root}/docs/design/board-sketch.html']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has no functioning checkers game; there is currently no way for two people to play a full game of checkers together.

**Approach:** Build a browser-playable React + TypeScript (Vite) website implementing an 8x8 checkers board with standard American/English draughts rules, local two-player turn-based play (click-to-select, click-to-move, with single-forced-move auto-play), and win/draw detection. The move-input layer is decoupled from the rules engine so an AI/PC opponent or online multiplayer can be added later without reworking the rules or board logic.

## Boundaries & Constraints

**Always:**
- Standard 8x8 board, 12 pieces per side on dark squares, starting in the standard checkers layout.
- Men move diagonally forward one square onto an empty dark square; captures jump diagonally over an adjacent opponent piece into the empty square beyond.
- Captures are mandatory whenever at least one is available to the player to move; if a piece captures and can capture again immediately, the same piece must continue capturing before the turn ends.
- Whenever the player to move (or an in-progress multi-jump) has exactly one legal move available in total, the app plays it automatically without waiting for a click.
- A man that reaches the opponent's back row is promoted to a king; kings may move/capture diagonally forward or backward.
- A player with no legal move on their turn (no pieces, or all pieces blocked) loses.
- If 40 consecutive full-turns pass with no capture, the game ends in a draw.
- All game state is held client-side in memory; no backend, network, or persistence for this spec.
- The move-input layer (currently local human click-to-select) is decoupled from the rules engine (`rules.ts`) and board state via a single `applyMove` entry point, so a future AI player, PC/bot opponent, or remote networked human can be plugged in later without changing rules or board logic.
- The shipped app's look and feel (board/piece colors, brass accent, typography, scoreboard rail layout) matches the approved sketch at `docs/design/board-sketch.html` on every screen, not just the board component. The implementing agent must verify this itself with a Playwright check before marking the work done (see Verification).

**Ask First:** Any request to change core rule behavior (e.g. make captures optional, change the draw threshold, add forced-capture toggle) requires explicit human approval before implementing.

**Never:** This spec ships local two-player play only — no AI/computer opponent, no online/networked multiplayer, no save/load, and no move undo are implemented now. Drag-and-drop input is out of scope (click-to-select/click-to-move only). The architecture must not preclude adding AI or online play later (see Always).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Select movable own piece | Click own piece with legal moves | Piece + its legal destination squares highlighted | N/A |
| Select immovable own piece | Click own piece with no legal moves | Nothing highlighted | N/A |
| Simple move | Click a highlighted empty destination | Piece moves there, turn passes to opponent | N/A |
| Mandatory capture elsewhere | A capture is available for a different piece | Selecting a non-capturing piece shows no valid moves | Attempting to move a non-capturing piece is blocked |
| Multi-jump continuation | Piece just captured and can capture again | Turn stays open; only that piece's further captures are selectable | Selecting another piece or ending turn is blocked |
| Promotion | Man moves into opponent's back row | Piece becomes a king (visually marked) | N/A |
| No legal moves | Player to move has no legal move | Game ends; opponent shown as winner | N/A |
| Draw threshold | 40 consecutive turns pass with no capture | Game ends; result shown as draw | N/A |
| No-op click | Click empty square/opponent piece with nothing selected | No state change | N/A |
| Only one legal move exists | Player to move (or a piece mid multi-jump) has exactly one legal move/continuation | Move executes immediately, no click required | N/A |

</frozen-after-approval>

## Code Map

- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` -- project scaffolding (Vite + React + TS)
- `src/main.tsx` -- app entry point
- `src/App.tsx` -- root component, composes Board + StatusBar
- `src/styles/tokens.css` -- palette, typography, and spacing tokens transcribed from `docs/design/board-sketch.html`; every component below styles through these, never hardcoded hex/fonts
- `src/game/types.ts` -- core types: `Piece`, `Position`, `SquareState`, `Board`, `Move`, `GameState`
- `src/game/board.ts` -- initial board construction, board query/update helpers
- `src/game/rules.ts` -- legal move + mandatory-capture generation, multi-jump chaining, promotion, win/draw detection
- `src/game/gameReducer.ts` -- reducer exposing a single `applyMove(state, move)` entry point; drives `SELECT_SQUARE` actions through it and auto-plays any turn/continuation with exactly one legal move
- `src/components/Board.tsx` -- renders 8x8 grid, forwards square clicks to reducer
- `src/components/Square.tsx` -- single square (color, highlight, contains Piece)
- `src/components/Piece.tsx` -- piece rendering (color, man vs king)
- `src/components/StatusBar.tsx` -- shows current turn, winner, or draw
- `src/game/rules.test.ts` -- unit tests covering the I/O & Edge-Case Matrix
- `e2e/visual.spec.ts` -- Playwright check that the running app's computed colors/typography match `docs/design/board-sketch.html`, plus a full-page screenshot for manual comparison

## Tasks & Acceptance

**Execution:**
- [ ] `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` -- scaffold a Vite + React + TypeScript project, add Playwright as a dev dependency -- establishes the runnable app shell and the visual-check tooling
- [ ] `src/styles/tokens.css` -- transcribe the palette (moss/buff/garnet/ink/brass + light/dark neutrals), font stacks, and spacing used in `docs/design/board-sketch.html` into CSS custom properties -- single source of design truth for every component
- [ ] `src/game/types.ts` -- define `Piece`, `Position`, `Board`, `Move`, `GameState` types -- shared vocabulary for the rules engine and UI
- [ ] `src/game/board.ts` -- implement initial board layout and board helpers (get/set square, enumerate own pieces) -- isolates board representation from rules logic
- [ ] `src/game/rules.ts` -- implement legal-move generation, mandatory-capture enforcement, multi-jump chaining, promotion, and win/draw detection per the Edge-Case Matrix -- the core game logic
- [ ] `src/game/gameReducer.ts` -- implement a reducer with a single `applyMove(state, move)` entry point that turns moves into board updates using `rules.ts`, tracking turn, in-progress multi-jump piece, and no-capture turn counter; after every state change, check `rules.ts` for an exactly-one-legal-move case and auto-invoke `applyMove` again if so -- single source of truth for game state transitions, and the seam a future AI/network move source will call into
- [ ] `src/components/Piece.tsx`, `src/components/Square.tsx`, `src/components/Board.tsx` -- render the board and pieces, wire clicks to the reducer -- visual + interaction layer
- [ ] `src/components/StatusBar.tsx` -- display whose turn it is, or the win/draw result -- surfaces game-end state to players
- [ ] `src/App.tsx`, `src/main.tsx` -- wire reducer, Board, and StatusBar into a running app -- final integration
- [ ] `src/game/rules.test.ts` -- unit tests for every row of the I/O & Edge-Case Matrix -- locks in rules correctness
- [ ] `e2e/visual.spec.ts` -- Playwright test loading the running app and asserting computed styles (board square colors, piece colors, brass accent, rail typography) match the tokens in `docs/design/board-sketch.html`; capture a screenshot -- the implementer's own proof the look-and-feel requirement was met, run before marking the spec done

**Acceptance Criteria:**
- Given the app just loaded, when the board renders, then it shows the standard 12-vs-12 starting position with the correct starting player indicated.
- Given any legal move completes, when the move resolves (including a full multi-jump chain), then the turn indicator switches to the other player.
- Given a win or draw condition is reached, when it triggers, then further square selection is disabled and the result is shown in the StatusBar.
- Given both sides are local humans on the same screen, when a move is applied, then it went through `applyMove` rather than a UI-specific code path -- confirms the reducer is the only seam a future AI/network move source would need.

## Design Notes

Represent the board as a flat array or 2D array keyed by `{row, col}` (0-7), tracking only the 32 playable dark squares logically. Keep `rules.ts` pure (board + player in, list of legal `Move`s out) so it is directly unit-testable without React. The reducer owns transient turn state: `selectedPosition`, `mustContinueCaptureFrom` (Position | null), and `turnsSinceLastCapture` (for the draw rule).

Extensibility seam: the reducer's only way to change the board is `applyMove(state, move)`, and it always sources `move` the same way regardless of who "decided" it -- a human click resolving to one candidate move, or the auto-play path resolving the sole legal move. This spec only ever supplies moves from local human clicks, but that single-entry-point shape is what would let a later spec add an AI move-picker or a networked-move listener beside the click handler without touching `rules.ts` or the reducer's internals. No AI/network code is written now.

## Verification

**Commands:**
- `npm install` -- expected: installs without errors
- `npm run build` -- expected: TypeScript compiles and Vite build succeeds
- `npm run test` -- expected: all `rules.test.ts` cases pass
- `npx playwright test e2e/visual.spec.ts` -- expected: computed colors/typography match `docs/design/board-sketch.html`; review the captured screenshot against the sketch before considering the spec done

**Manual checks (if no CLI):**
- `npm run dev`, open the app, and play a full game through to a win and (separately) verify the draw path is reachable in code review of the counter logic.
