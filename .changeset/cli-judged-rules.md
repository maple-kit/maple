---
"@maple-kit/cli": minor
---

`maple lint` and `maple ci lint` run the judged design-lint tier (#126) from a lint config file: `maple.lint.config.ts` at the repository root, or `--config=<path>`. Its default export is `defineLintConfig({ rules, maxPerRule?, maxTargets?, maxHtml? })`, a new export of `@maple-kit/cli`; Node 24 strips the types as it imports, so nothing is installed. A rule is `{ id, question, appliesTo, severity? }`; jev judges, with the key in `TYPESAFE_API_KEY` (`MAPLE_AI_MODEL` and `MAPLE_AI_API` as for the assist tier). With no config file nothing changes, and a config that does not load or validate exits 1, in `maple ci lint` too. Rules without a key are an error for `maple lint`, and a "skipped" note in the `maple/design-lint` summary for `maple ci lint`. There is no `--rules` flag and no JSON rules file.

Changed code is judged first. `maple ci lint` on a pull request reads the PR's files from the GitHub API and passes them as `judged.sources` (if GitHub refuses, the summary says so and the filter is dropped); `maple lint --changed[=<base>]` uses `git diff --name-only <base>...HEAD`, `origin/main` by default. Both outputs say what was not judged from `judgedStats`, such as "Judged 12 of 87 matches (5 groups); 3 rules hit the cap: a, b, c; skipped 40 unchanged" and "Narrow `appliesTo` for: x", without changing the conclusion. Viewports the judge failed on are listed as "unchecked, not clean" and never fail the check on their own.

`maple lint --json` gains `judgedErrors` and `judgedStats`; `runCiLint` takes `judged`, `judgedSkipped` and `judgedUnfiltered` and its result carries `judgedErrors` and `judgedStats`; `CiLintDeps.lint` may return both. `@maple-kit/classifier` is an optional peer, loaded only when rules are given.
