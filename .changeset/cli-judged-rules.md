---
"@maple-kit/cli": minor
---

`maple lint` and `maple ci lint` take `--rules=<rules.json>` and run the judged design-lint tier (#126). The file is `{ "rules": [{ "id", "question", "appliesTo", "severity"? }], "maxPerRule"?, "maxTargets"?, "maxHtml"? }` (or the bare array); jev judges, with the key in `TYPESAFE_API_KEY` (`MAPLE_AI_MODEL` and `MAPLE_AI_API` as for the assist tier). Without the flag nothing changes. Rules without a key are an error for `maple lint`, and a "skipped" note in the `maple/design-lint` summary for `maple ci lint`. Viewports the judge failed on are listed as "unchecked, not clean" in the summary and the terminal, and never fail the check on their own. `maple lint --json` gains `judgedErrors`; `runCiLint` takes `judged` and `judgedSkipped` and its result carries `judgedErrors`; `CiLintDeps.lint` may return `judgedErrors`. `@maple-kit/classifier` is an optional peer, loaded only when rules are given.
