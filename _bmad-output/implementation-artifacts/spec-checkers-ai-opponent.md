---
title: 'Checkers vs AI Opponent'
type: 'feature'
created: '2026-07-21'
status: 'done'
review_loop_iteration: 0
context: ['{project-root}/src/game/gameReducer.ts', '{project-root}/src/game/rules.ts']
baseline_commit: '848aea73d2155d6023d2df85beae61625473b5f2'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app only supports local two-player play; there is no way to play solo against a computer opponent.

**Approach:** Add a pre-game setup screen offering "vs Human" (existing behavior, unchanged) or "vs AI" (choose your color and a difficulty). The AI opponent is a minimax search with alpha-beta pruning that plugs into the existing `applyMove` reducer entry point -- the exact seam that spec was built for -- so no changes to `rules.ts`'s move-generation semantics are needed.

## Boundaries & Constraints

**Always:**
- The setup screen offers exactly two modes: "vs Human" and "vs AI". Mode, color, and difficulty are chosen once, before the board renders, and are fixed for that game.
- In "vs AI", the human picks Red or Black; the AI takes the other color.
- Difficulty (Easy/Medium/Hard) maps to a fixed minimax search depth (Easy < Medium < Hard); depth is chosen so a move typically resolves in well under 2 seconds.
- The AI's search treats one full turn as one ply for alternating sides: if a chosen move leaves the same player facing a further capture *choice* (not a forced single continuation), the search recurses at the same depth and same maximizing/minimizing side; depth only decrements when the turn actually passes to the other player.
- No move is ever auto-played, for either player -- not at turn-start, not mid multi-jump. When the AI has exactly one legal move/continuation, `chooseAiMove` still runs (as a cheap O(1) return, no search needed) and still goes through the same visible "AI is thinking" turn as a real decision; it is never skipped.
- While the AI is deciding a move, board input is disabled and the StatusBar shows an "AI is thinking" state.
- AI moves apply through the existing `applyMove` entry point via a new `PLAY_MOVE` action, not through simulated clicks.
- A "New Game" control returns to the setup screen from either mode at any time.
- All existing rules (mandatory captures, multi-jump chaining, kinging, draw-after-40, win-on-no-moves) are unchanged and shared by both modes.

**Ask First:** Changing the evaluation function's philosophy beyond material + king value (e.g. adding personality/aggression weighting) requires approval. Lowering a difficulty's search depth for performance is fine without approval; switching the algorithm itself (e.g. to MCTS) is not.

**Never:** No online/networked opponent, no difficulty change mid-game, no persistence of mode/settings between sessions, no undo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start vs AI as Black | Human picks Black + a difficulty, starts game | AI (Red) computes and plays the opening move immediately | N/A |
| AI turn, single forced move | AI to move, exactly one legal move/continuation | Still goes through the visible "AI is thinking" turn (no silent skip); `chooseAiMove` returns immediately with no search | N/A |
| AI turn, real choice | AI to move, more than one legal move | Board input disabled, "AI is thinking" shown, minimax picks and plays a move (resolving any further multi-jump choices itself) before re-enabling input | N/A |
| Human clicks during AI's turn | Click while AI is deciding | No-op; board is disabled | N/A |
| Game ends in vs AI mode | Win/draw condition reached | Same lockout and StatusBar result as vs Human; "New Game" still available | N/A |

</frozen-after-approval>

## Code Map

- `src/game/types.ts` -- add `GameMode` ('human' \| 'ai'), `Difficulty` ('easy' \| 'medium' \| 'hard'), and a `PLAY_MOVE` variant on `Action`
- `src/game/gameReducer.ts` -- handle `PLAY_MOVE` by calling `applyMove(state, move)`, identical post-processing to a human move (no auto-play for either)
- `src/ai/evaluate.ts` -- static board evaluation: material with king weight, from a given color's perspective; +/-Infinity-ish for won/draw terminal states
- `src/ai/minimax.ts` -- alpha-beta search choosing the best move for the player to move at a given depth, honoring the same-ply multi-jump-choice recursion rule above; exports `DIFFICULTY_DEPTH` map and `chooseAiMove(state, depth)`
- `src/ai/minimax.test.ts` -- unit tests for search correctness (prefers captures/wins, resolves multi-jump choices, respects depth)
- `src/components/GameSetup.tsx` -- mode/color/difficulty picker + "Start Game", styled with the existing design tokens
- `src/App.tsx` -- owns setup-vs-playing phase; on the AI's turn with a real choice, disables input, computes the AI move (e.g. via a short `setTimeout` so "thinking" is visibly real), dispatches `PLAY_MOVE`; renders "New Game" back to setup
- `src/components/StatusBar.tsx` -- add the "AI is thinking" state and an opponent-type label
- `e2e/ai-mode.spec.ts` -- Playwright: start a vs-AI game, make a human move, assert the AI responds and the turn returns to the human

## Tasks & Acceptance

**Execution:**
- [x] `src/game/types.ts` -- add `GameMode`, `Difficulty`, and the `PLAY_MOVE` action variant -- shared vocabulary for setup and AI
- [x] `src/game/gameReducer.ts` -- handle `PLAY_MOVE` through `applyMove` -- reuses the extensibility seam as designed, no rules changes (later renegotiated to drop auto-play entirely, see Spec Change Log)
- [x] `src/ai/evaluate.ts` -- material + king-weighted evaluation with terminal-state scoring -- the search's objective function
- [x] `src/ai/minimax.ts` -- alpha-beta search over `currentLegalMoves`/`applyMove`, same-ply recursion for multi-jump choices, `DIFFICULTY_DEPTH` map -- the AI's decision engine
- [x] `src/ai/minimax.test.ts` -- unit tests per the Edge-Case Matrix plus a same-ply multi-jump-choice regression -- locks in search correctness
- [x] `src/components/GameSetup.tsx` -- mode/color/difficulty picker screen -- entry point into either mode
- [x] `src/App.tsx` -- setup/playing phase switch, AI-turn effect (disable input, compute, dispatch `PLAY_MOVE`), "New Game" -- wires everything together
- [x] `src/components/StatusBar.tsx` -- "AI is thinking" state and opponent label -- surfaces AI turn state to the player
- [x] `e2e/ai-mode.spec.ts` -- end-to-end vs-AI turn exchange -- proves the whole loop works in a real browser

**Acceptance Criteria:**
- Given "vs AI" is chosen with the human as Black, when the game starts, then the AI (Red) makes the opening move without any human click.
- Given it is the AI's turn with more than one legal move, when the AI decides, then board input is disabled until the AI's full turn (including any multi-jump choices) completes.
- Given a game in either mode reaches a win or draw, when it ends, then the same lockout/result UI applies and "New Game" returns to the setup screen.

## Spec Change Log

- **2026-07-22, human-initiated renegotiation:** Removed the single-legal-move auto-play rule entirely, matching the same renegotiation in `spec-checkers-game.md`. The AI's `chooseAiMove`/`withAutoPlay`-skip-guard combination (previously: skip the search and let `withAutoPlay` silently resolve a forced move) is replaced by always running `chooseAiMove` (its own `length===1` fast path avoids wasting a search) and always showing the visible "AI is thinking" turn. `withAutoPlay` was deleted from `gameReducer.ts`.

## Design Notes

The same-ply recursion is the one non-obvious piece: at a state where `currentLegalMoves(state).length > 1`, for each candidate move compute `next = applyMove(state, move)`. If `next.currentPlayer === state.currentPlayer` (a further capture choice, not the sole option), recurse into `next` at the *same* depth and same maximizing side -- it's still the same turn. Only when `next.currentPlayer !== state.currentPlayer` (or the game ended) does depth decrement and the maximizing side flip. Every move inside the search -- forced or chosen -- is applied one atomic step at a time via `applyMove` alone; the search never bulk-resolves a chain, which keeps its ply-counting exact regardless of how the outer game loop handles (or, since the 2026-07-22 renegotiation, doesn't handle) auto-play.

Evaluation: score = (ownMen + ownKings * 1.5) - (oppMen + oppKings * 1.5) from the AI's own color's perspective; a won state scores a large constant (e.g. 10000) adjusted by sign for winner, a draw scores 0. Keep it this simple for v1 -- no mobility/positional terms unless Easy/Hard turn out indistinguishable in practice.

`chooseAiMove` should cap total nodes visited (e.g. ~200k) as a safety net against a pathological branchy position at Hard depth, returning the best move found so far rather than hanging.

## Verification

**Commands:**
- `npm install` -- expected: installs without errors (no new runtime deps needed, AI logic is plain TS)
- `npm run build` -- expected: TypeScript compiles and Vite build succeeds
- `npm run test` -- expected: all existing tests plus new `minimax.test.ts` cases pass
- `npx playwright test e2e/ai-mode.spec.ts` -- expected: a vs-AI turn exchange completes and the human regains control

**Manual checks (if no CLI):**
- `npm run dev`, start a vs-AI game as each color at each difficulty, and confirm the AI never takes more than ~2 seconds to move and never makes an illegal move.

## Suggested Review Order

**AI search (core decision logic)**

- Entry point: `chooseAiMove` only runs when there's a real choice; the same-ply recursion is the one subtle piece.
  [`minimax.ts:106`](../../src/ai/minimax.ts#L106)
- The depth-0 cutoff now waits out an in-progress forced multi-jump instead of undervaluing it -- caught by adversarial review.
  [`minimax.ts:69`](../../src/ai/minimax.ts#L69)
- A wall-clock deadline (not just a node count) actually enforces the "well under 2s" target.
  [`minimax.ts:36`](../../src/ai/minimax.ts#L36)
- `evaluate.ts` is the objective function the whole search optimizes for.
  [`evaluate.ts:1`](../../src/ai/evaluate.ts#L1)

**The extensibility seam, proven out**

- `PLAY_MOVE` now validates against `currentLegalMoves` before mutating -- the AI is the first real caller of the seam the previous spec built, and it had zero input validation until this review.
  [`gameReducer.ts:135`](../../src/game/gameReducer.ts#L135)

**Setup screen & wiring**

- Mode/color/difficulty picker; toggle groups now expose `aria-pressed`/`role="group"` for screen readers.
  [`GameSetup.tsx:35`](../../src/components/GameSetup.tsx#L35)
- AI-turn effect: disables input, delays for a real "thinking" pause, dispatches `PLAY_MOVE`.
  [`App.tsx:32`](../../src/App.tsx#L32)
- Board no longer leaks the AI's forced-continuation highlight to the human while input is disabled.
  [`Board.tsx:12`](../../src/components/Board.tsx#L12)

**Tests**

- Regression test for the depth-cutoff fix -- fails without it, which is the point.
  [`minimax.test.ts:70`](../../src/ai/minimax.test.ts#L70)
- `PLAY_MOVE` legality tests, including a wrong-piece-mid-chain case.
  [`rules.test.ts:167`](../../src/game/rules.test.ts#L167)
- `ai-mode.spec.ts` now asserts something real instead of a tautology, and covers the human-plays-Black opening.
  [`ai-mode.spec.ts:9`](../../e2e/ai-mode.spec.ts#L9)

**Peripherals**

- Shared `capitalize` replaces three copies; `GameConfig` moved to the domain layer; dead `gameKey` removed.
  [`format.ts:1`](../../src/format.ts#L1)

### Review Findings

_Independent code review (Opus, 2026-07-22): Blind Hunter + Edge Case Hunter + Acceptance Auditor. Acceptance Auditor found zero spec violations — every AC and "Always" constraint verified implemented. Findings below are quality/robustness around the AI's edges._

- [x] [Review][Patch] (was Decision — resolved: accept the freeze, no Web Worker) Search runs on the main thread; kept there, `SEARCH_DEADLINE_MS` tightened 1500→1000ms so the freeze stays sub-second and delay+search+overshoot stays under 2s. [`src/ai/minimax.ts:39`] — **fixed**
- [x] [Review][Dismiss] (was Decision — resolved: keep deterministic) AI has no tie-breaking; same difficulty + position plays an identical game. User chose to keep deterministic behavior (predictable + keeps move-exact tests stable). No change.
- [x] [Review][Patch] Terminal win/loss scores are not depth-adjusted — flat ±10000, so a winning AI had no incentive to convert (could drift to draw-at-40). Now folds ply-distance into the terminal score (`WIN_SCORE - ply`), locked by new `evaluate.test.ts`. [`src/ai/evaluate.ts:16`] — **fixed**
- [x] [Review][Patch] Budget cutoff truncated a forced multi-jump — `budgetExceeded` now shares the `!mustContinueFrom` carve-out with the depth-0 guard, so an abort mid-chain no longer understates guaranteed captures. [`src/ai/minimax.ts:87`] — **fixed**
- [x] [Review][Patch] Total AI latency could exceed the "well under 2s" target — deadline tightened (see first item); 400ms delay + 1000ms search + overshoot now stays under 2s. [`src/ai/minimax.ts:39`] — **fixed**
- [x] [Review][Patch] Disabled squares not exposed to assistive tech — now sets `aria-disabled={disabled}` and `tabIndex={disabled ? -1 : 0}`. [`src/components/Square.tsx:27`] — **fixed**
- [x] [Review][Patch] Flaky wall-clock unit assertion removed; the depth test keeps its legal-move correctness assertions. [`src/ai/minimax.test.ts:132`] — **fixed**
- [x] [Review][Defer] Crowning mid-jump doesn't end the turn [`src/game/rules.ts`] — deferred, pre-existing. Standard American/English draughts ends the move on promotion; the shared engine (from the base-game story) lets a freshly-crowned man keep jumping, and the AI now exploits it. Rules-correctness question for a focused pass, not caused by this change.
