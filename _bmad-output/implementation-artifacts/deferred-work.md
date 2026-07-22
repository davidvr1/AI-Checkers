# Deferred Work

## Deferred from: code review of spec-checkers-ai-opponent (2026-07-22)

- Crowning mid-jump doesn't end the turn (`src/game/rules.ts` / `applyMove` continuation logic). Standard American/English draughts ends a move the instant a man is crowned; the shared rules engine (introduced in the base-game story, a documented judgment call at the time) instead lets a freshly-promoted man continue capturing as a king in the same turn, and the minimax AI now actively seeks out and exploits these lines. Pre-existing shared-engine behavior, not caused by the AI feature. Needs a focused rules-correctness decision: confirm the intended promotion-ends-turn rule and, if changed, update `applyMove`'s continuation check plus the affected tests.
