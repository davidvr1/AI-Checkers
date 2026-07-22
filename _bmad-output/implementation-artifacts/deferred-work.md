# Deferred Work

## Deferred from: code review of spec-checkers-ai-opponent (2026-07-22)

- Crowning mid-jump doesn't end the turn (`src/game/rules.ts` / `applyMove` continuation logic). Standard American/English draughts ends a move the instant a man is crowned; the shared rules engine (introduced in the base-game story, a documented judgment call at the time) instead lets a freshly-promoted man continue capturing as a king in the same turn, and the minimax AI now actively seeks out and exploits these lines. Pre-existing shared-engine behavior, not caused by the AI feature. Needs a focused rules-correctness decision: confirm the intended promotion-ends-turn rule and, if changed, update `applyMove`'s continuation check plus the affected tests.

## Deferred from: code review of the move-log feature (2026-07-22)

- `GameState.history` grows via a plain array spread with no cap and no append-only enforcement (`gameReducer.ts`'s `withHistory`, `moveLog.ts`'s `index: state.history.length` numbering). Harmless at this game's real scale (a full game is at most a few dozen real moves, bounded further by the 40-turn draw rule), and nothing currently mutates history non-append-only. Would need real enforcement (or at least a test pinning the assumption) only if a future feature -- undo, save/load replay, move-list scrubbing -- starts mutating or truncating `history` directly.
