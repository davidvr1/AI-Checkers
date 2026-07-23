---
title: 'Playable Checkers Game (Human vs Human)'
type: 'feature'
created: '2026-07-21'
status: 'done'
review_loop_iteration: 0
context: ['{project-root}/docs/design/board-sketch.html']
baseline_commit: 'b3959074430eaf24cd9122671c2d9908942e5fc1'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has no functioning checkers game; there is currently no way for two people to play a full game of checkers together.

**Approach:** Build a browser-playable React + TypeScript (Vite) website implementing an 8x8 checkers board with standard American/English draughts rules, local two-player turn-based play (click-to-select, click-to-move -- every move, including a forced single one, requires an explicit click), and win/draw detection. The move-input layer is decoupled from the rules engine so an AI/PC opponent or online multiplayer can be added later without reworking the rules or board logic.

## Boundaries & Constraints

**Always:**
- Standard 8x8 board, 12 pieces per side on dark squares, starting in the standard checkers layout.
- Men move diagonally forward one square onto an empty dark square; captures jump diagonally over an adjacent opponent piece into the empty square beyond.
- Captures are mandatory whenever at least one is available to the player to move; if a piece captures and can capture again immediately, the same piece must continue capturing before the turn ends.
- No move is ever auto-played, even when it is the only legal option -- not at the start of a turn, and not mid multi-jump. The player to move (human or AI) must always take an explicit action (a click, or the AI's own turn-taking cycle) for every single move.
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
| Only one legal move exists | Player to move (or a piece mid multi-jump) has exactly one legal move/continuation | Destination is highlighted like any other legal move; the player must still click it -- no auto-play | N/A |

</frozen-after-approval>

## Spec Change Log

- **2026-07-22, human-initiated renegotiation:** Removed the single-legal-move auto-play rule entirely (was: "the app plays it automatically without waiting for a click"). Reason: user explicitly wants to click through every move, including forced ones, with no exceptions -- confirmed to apply at turn-start, mid multi-jump, and to the AI opponent's own turns as well (see `spec-checkers-ai-opponent.md`'s equivalent rule and its Spec Change Log). `withAutoPlay` was removed from `gameReducer.ts`; every move now requires one explicit action (a click, or the AI's turn-taking cycle) per atomic step.

- **2026-07-22, human-initiated renegotiation (Israeli/international draughts ruleset):** User requested the game follow the rules described at `https://he.wikibooks.org/wiki/דמקה/כללי_המשחק`, with scope confirmed via clarifying questions. This changes several frozen "Always" bullets and the I/O matrix; the frozen text above is superseded by the following where they conflict:
  - **Kings are now "flying kings":** a king slides any distance along a clear diagonal for a simple move, and for a capture may jump the first enemy piece met along a diagonal and land on *any* empty square beyond it (up to the next occupied square or the board edge). Supersedes "kings may move/capture diagonally forward or backward" read as one square.
  - **Man-vs-king capture restriction:** a man may only capture an enemy *king* by jumping forward; capturing an enemy *man* stays unrestricted (any diagonal, including backward). Supersedes the unqualified "jump diagonally over an adjacent opponent piece" for the king-target case.
  - **Two new draw conditions:** threefold repetition (same board + player-to-move recurring three times) and insufficient material (exactly one king per side and nothing else) now end the game as a draw, alongside the no-capture limit.
  - **No-capture draw threshold raised 40 → 50** half-moves (`DRAW_TURN_LIMIT`), per the page's "50 consecutive moves without a change in piece count." (Covered by the `Ask First` clause "change the draw threshold"; approved by the user in this renegotiation.)
  - **Explicitly kept unchanged, per the user's choice:** captures remain mandatory (the page's default is optional captures with an "עם שרופים" forced-capture variant; the user chose to keep the existing always-mandatory behavior). The page's free choice among available captures is retained -- there is deliberately **no** maximum-capture ("majority") rule.
  - **Deliberately out of scope for this renegotiation:** the page's "three kings → win within 12 moves" rule (user chose not to implement it).

- **2026-07-23, human-initiated renegotiation (men capture forward only):** After playing, the user observed a man capturing backward and preferred it be disallowed. Confirmed via the he.wikibooks page that backward captures for men ARE permitted there ("אין הגבלה על מספר הדילוגים הרצופים ועל כיוונם, כלומר בדילוג כן מותרת תנועה אחורה"), so this is a deliberate divergence from the page toward the American/English rule. **Men now capture forward only** -- the two forward diagonals, for BOTH man and king targets. This *supersedes* the previous change-log bullet "a man may only capture an enemy king by jumping forward; capturing an enemy man stays unrestricted (any diagonal, including backward)": the forward-only restriction now applies to every man capture regardless of target, so the man-can't-capture-king-backward case is simply a subset. Kings are unaffected -- they remain flying kings capturing in all four diagonal directions. Implemented in `rules.ts`'s `pieceCaptureMoves` man branch (now iterates only the two forward directions); `getAllLegalMoves`, multi-jump continuation, and the AI all inherit it unchanged. Note: the app's rules blurb still reads "Israeli/international draughts"; the shipped ruleset is now a hybrid (international flying kings + American forward-only man captures + mandatory captures + expanded draws).

### Review Findings (bmad-code-review, 2026-07-22, Opus, 3-layer: Blind Hunter + Edge Case Hunter + Acceptance Auditor)

- [ ] [Review][Decision] Man promoted mid-capture-chain continues the same turn with flying-king powers, which also bypasses the new man-vs-king forward-only restriction — the continuation runs the unrestricted king branch [`rules.ts:172`, `gameReducer.ts:55`]. Root cause is the pre-existing "crowning mid-jump doesn't end the turn" behavior (see deferred-work.md); this branch's new man-vs-king rule gives it a new sharp edge. Needs the user's rules intent.
- [ ] [Review][Patch] Insufficient-material draw overrides a forced winning capture — a 1-king-vs-1-king position where the side to move can immediately fly-capture the last enemy king is scored as a draw instead of a win [`gameReducer.ts:82`, `rules.ts:132`]. (blind+edge+auditor)
- [ ] [Review][Patch] `isInsufficientMaterial` treats any two kings as a draw, including two same-color kings; correct only by relying on the win check running first [`rules.ts:132`]. (edge+auditor)
- [ ] [Review][Patch] Missing tests: flying-king multi-jump chain at the rules level; `positionHistory` reset-on-capture invariant; `isInsufficientMaterial` two-same-color-kings negative case; the winning-capture-not-drawn case above. (auditor)
- [ ] [Review][Patch] Both frozen spec docs were out of sync with shipped behavior with no Spec Change Log entry (this entry + the ai-opponent entry resolve it). (auditor)
- [ ] [Review][Patch] Doc wording: `DRAW_TURN_LIMIT` comment says "50 consecutive moves" but the counter is half-moves (25 per side) [`gameReducer.ts:12`]; and the `DIFFICULTY_DEPTH` benchmark comment in `minimax.ts` predates flying kings' larger branching factor [`minimax.ts:8`]. (blind)
- [x] [Review][Defer] Captured pieces are removed immediately rather than kept as phantom blockers until the turn ends; a flying king can re-cross a square vacated earlier in the same chain [`rules.ts:167`] — deferred, ruleset-dependent (source page does not require phantom-blocking).
- [x] [Review][Defer] Threefold-repetition search pollution: minimax inherits the real game's `positionHistory`, so a hypothetical endgame line can be mis-scored as a draw [`minimax.ts:165`, `gameReducer.ts:76`] — deferred, endgame-only and subtle.
- [x] [Review][Defer] AI hot-path constant-factor growth (positionKey string-build + history spread/filter + full-board `isInsufficientMaterial` scan per node) [`board.ts:60`, `rules.ts:132`] — deferred, bounded by the existing wall-clock search deadline.

## Code Map

- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` -- project scaffolding (Vite + React + TS)
- `src/main.tsx` -- app entry point
- `src/App.tsx` -- root component, composes Board + StatusBar
- `src/styles/tokens.css` -- palette, typography, and spacing tokens transcribed from `docs/design/board-sketch.html`; every component below styles through these, never hardcoded hex/fonts
- `src/game/types.ts` -- core types: `Piece`, `Position`, `SquareState`, `Board`, `Move`, `GameState`
- `src/game/board.ts` -- initial board construction, board query/update helpers
- `src/game/rules.ts` -- legal move + mandatory-capture generation, multi-jump chaining, promotion, win/draw detection
- `src/game/gameReducer.ts` -- reducer exposing a single `applyMove(state, move)` entry point; drives `SELECT_SQUARE` actions through it, one explicit move at a time (no auto-play, even for a forced single move)
- `src/components/Board.tsx` -- renders 8x8 grid, forwards square clicks to reducer
- `src/components/Square.tsx` -- single square (color, highlight, contains Piece)
- `src/components/Piece.tsx` -- piece rendering (color, man vs king)
- `src/components/StatusBar.tsx` -- shows current turn, winner, or draw
- `src/game/rules.test.ts` -- unit tests covering the I/O & Edge-Case Matrix
- `e2e/visual.spec.ts` -- Playwright check that the running app's computed colors/typography match `docs/design/board-sketch.html`, plus a full-page screenshot for manual comparison

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` -- scaffold a Vite + React + TypeScript project, add Playwright as a dev dependency -- establishes the runnable app shell and the visual-check tooling
- [x] `src/styles/tokens.css` -- transcribe the palette (moss/buff/garnet/ink/brass + light/dark neutrals), font stacks, and spacing used in `docs/design/board-sketch.html` into CSS custom properties -- single source of design truth for every component
- [x] `src/game/types.ts` -- define `Piece`, `Position`, `Board`, `Move`, `GameState` types -- shared vocabulary for the rules engine and UI
- [x] `src/game/board.ts` -- implement initial board layout and board helpers (get/set square, enumerate own pieces) -- isolates board representation from rules logic
- [x] `src/game/rules.ts` -- implement legal-move generation, mandatory-capture enforcement, multi-jump chaining, promotion, and win/draw detection per the Edge-Case Matrix -- the core game logic
- [x] `src/game/gameReducer.ts` -- implement a reducer with a single `applyMove(state, move)` entry point that turns moves into board updates using `rules.ts`, tracking turn, in-progress multi-jump piece, and no-capture turn counter; after every state change, check `rules.ts` for an exactly-one-legal-move case and auto-invoke `applyMove` again if so -- single source of truth for game state transitions, and the seam a future AI/network move source will call into
- [x] `src/components/Piece.tsx`, `src/components/Square.tsx`, `src/components/Board.tsx` -- render the board and pieces, wire clicks to the reducer -- visual + interaction layer
- [x] `src/components/StatusBar.tsx` -- display whose turn it is, or the win/draw result -- surfaces game-end state to players
- [x] `src/App.tsx`, `src/main.tsx` -- wire reducer, Board, and StatusBar into a running app -- final integration
- [x] `src/game/rules.test.ts` -- unit tests for every row of the I/O & Edge-Case Matrix -- locks in rules correctness
- [x] `e2e/visual.spec.ts` -- Playwright test loading the running app and asserting computed styles (board square colors, piece colors, brass accent, rail typography) match the tokens in `docs/design/board-sketch.html`; capture a screenshot -- the implementer's own proof the look-and-feel requirement was met, run before marking the spec done

**Acceptance Criteria:**
- Given the app just loaded, when the board renders, then it shows the standard 12-vs-12 starting position with the correct starting player indicated.
- Given any legal move completes, when the move resolves (including a full multi-jump chain), then the turn indicator switches to the other player.
- Given a win or draw condition is reached, when it triggers, then further square selection is disabled and the result is shown in the StatusBar.
- Given both sides are local humans on the same screen, when a move is applied, then it went through `applyMove` rather than a UI-specific code path -- confirms the reducer is the only seam a future AI/network move source would need.

## Design Notes

Represent the board as a flat array or 2D array keyed by `{row, col}` (0-7), tracking only the 32 playable dark squares logically. Keep `rules.ts` pure (board + player in, list of legal `Move`s out) so it is directly unit-testable without React. The reducer owns transient turn state: `selectedPosition`, `mustContinueCaptureFrom` (Position | null), and `turnsSinceLastCapture` (for the draw rule).

Extensibility seam: the reducer's only way to change the board is `applyMove(state, move)`, and it always sources `move` the same way regardless of who "decided" it -- a human click resolving to one candidate move, or (per the later AI spec) a search result resolving to one. This spec only ever supplies moves from local human clicks, but that single-entry-point shape is what would let a later spec add an AI move-picker or a networked-move listener beside the click handler without touching `rules.ts` or the reducer's internals. No AI/network code is written now.

## Verification

**Commands:**
- `npm install` -- expected: installs without errors
- `npm run build` -- expected: TypeScript compiles and Vite build succeeds
- `npm run test` -- expected: all `rules.test.ts` cases pass
- `npx playwright test e2e/visual.spec.ts` -- expected: computed colors/typography match `docs/design/board-sketch.html`; review the captured screenshot against the sketch before considering the spec done

**Manual checks (if no CLI):**
- `npm run dev`, open the app, and play a full game through to a win and (separately) verify the draw path is reachable in code review of the counter logic.

## Suggested Review Order

**Rules engine (core game logic)**

- Entry point: mandatory captures now check all 4 diagonals, not just a piece's forward directions -- fixes a real rules bug (men couldn't capture backward).
  [`rules.ts:54`](../../src/game/rules.ts#L54)
- `applyMoveToBoard` now validates bounds/occupancy/capture-ownership before mutating -- the AI/network extensibility seam had zero input validation.
  [`rules.ts:89`](../../src/game/rules.ts#L89)

**Reducer (state machine)**

- `applyMove` is the single seam every move flows through; continuation/auto-play/win-draw logic lives here.
  [`gameReducer.ts:25`](../../src/game/gameReducer.ts#L25)
- `handleSelectSquare` now bounds-checks `position` before indexing the board.
  [`gameReducer.ts:96`](../../src/game/gameReducer.ts#L96)

**Design fidelity**

- Tokens transcribed from the approved sketch; every component styles through these custom properties.
  [`tokens.css:1`](../../src/styles/tokens.css#L1)
- Playwright reads `docs/design/board-sketch.html`'s own CSS variables at runtime and asserts the live app matches them -- not a hardcoded copy.
  [`visual.spec.ts:1`](../../e2e/visual.spec.ts#L1)

**Components**

- `Square` is now keyboard-operable (`role="button"`, Enter/Space) -- it was the only interactive element in the app and had no non-mouse path.
  [`Square.tsx:17`](../../src/components/Square.tsx#L17)
- `Board`'s destination highlighting is the single source both the UI and the mandatory-capture rule share -- no duplicated move logic.
  [`Board.tsx:15`](../../src/components/Board.tsx#L15)

**Tests**

- New coverage for backward captures, promotion mid-chain-as-king, and post-game-over lockout.
  [`rules.test.ts:99`](../../src/game/rules.test.ts#L99)

**Peripherals**

- `reuseExistingServer` now respects `CI` to avoid a stale-server footgun.
  [`playwright.config.ts:10`](../../playwright.config.ts#L10)
- `@types/node` re-pinned off an outlier major version.
  [`package.json:19`](../../package.json#L19)
