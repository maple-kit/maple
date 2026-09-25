---
"@maple-kit/core": minor
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

Three body states join `empty`, `one` and `many`: `long` (every text as long
as the page could receive, from its own characters, and every number at its
widest), `sparse` (everything that may be missing is missing) and `mixed` (a
list covering every enum value, both booleans, null and set, absent and
present, short and long text). `MOCK_STATES` lists them last, the recipe stays
version 2, and the mock box shows a button for each.

**Breaking:** a 0.9.0 reader refuses a recipe naming one of them, as it refuses
any state it does not know. They ship in the same release as the version-2
recipe, which no released reader has seen either.

`MOCK_PLAN_STATES` is now its own list rather than `MOCK_STATES` plus `none`,
and `MockPlanState` is its element type: the plan does not pick the three new
states until its evals measure them.
