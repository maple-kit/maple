---
"@maple-kit/core": minor
"@maple-kit/classifier": patch
---

The plan picks `long`, `sparse` and `mixed`. `MOCK_PLAN_STATES` is
`MOCK_STATES` plus `none` again, and `MOCK_PLAN_STATE_DESCRIPTIONS` describes
the three, which is what jev judges against. `keywordClassifier()` reads
"truncated", "no avatar" and "every status", among others. "long" and
"overflow" now read as `long`; `many` keeps "a long list" and "overflows
with".

`stateFromWeights` spreads a fixed prior of 1.4 across the states rather than
0.2 each, so a single matched word stays above `PLAN_FLOOR` with nine states.

**Breaking:** `MockPlanState` gains the three states, so a
`Record<MockPlanState, …>` needs them.
