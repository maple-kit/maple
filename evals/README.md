# Evals

Every AI path in Maple ships with an eval set and a pass-rate threshold that CI
enforces. A prompt without an eval is a prompt nobody can change safely.

**Status:** reserved. There are no cases here yet, because there is no AI code
yet. This file fixes the conventions so the first case does not invent them.

## Harness

[evalite](https://evalite.dev), which runs on vitest. Same runner, same
reporters, same watch mode as the rest of the repository, so an eval is a test
that happens to score instead of assert.

### Adding it

evalite is not a dependency yet. When the first eval lands:

```
pnpm add -Dw evalite
```

It pulls in `better-sqlite3` for its local result store, which builds at install
time. Because `.npmrc` sets `ignore-scripts=true`, that build is blocked until
`better-sqlite3` is added to `onlyBuiltDependencies` in `pnpm-workspace.yaml` —
with a one-line reason, as that list requires.

If evalite fights the Effect-based code in `packages/core/src/ai/`, port the
scoring harness onto plain vitest rather than working around it. The conventions
below are the part that matters; the runner is replaceable.

## Conventions

### Case ids

Every case has a stable id, and ids are never reused:

```
<area>-<nnn>    e.g. classify-014, dedupe-003, trail-021
```

The id is what a regression is reported against, so renaming one loses the
history.

### Environment

| Variable          | Meaning                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `EVAL_SAMPLES=n`  | Run every case `n` times. Models are non-deterministic; a case that passes once may pass 60% of the time, and that is what this exposes. |
| `EVAL_IDS=a,b,c`  | Run only these case ids, for iterating on one failure.                                                                                   |
| `MAPLE_AI_MODEL=` | Which model to run against, so comparing providers is a flag rather than a rewrite.                                                      |

### Thresholds

Each eval file declares a minimum pass rate. CI fails below it. A threshold is
raised when the implementation improves and **never lowered to make a build
green** — a lowered threshold is a silent regression with a commit message.

With `EVAL_SAMPLES > 1`, the pass rate is over all runs, not over cases. A case
that passes 3 of 5 contributes 0.6.

### Cases

Real, anonymised comments and trails collected during dogfooding. No
synthetic-only sets: synthetic cases encode what the author expected people to
write, which is exactly the thing being tested.

Anonymising means replacing identifiers and host names, not rewriting the
English. A comment's phrasing is the input.

### Reports

CI uploads the report as a build artifact on every run, so a drop can be read
without reproducing it locally.

## Layout

```
evals/
  README.md            this file
  cases/               one directory per area, JSON case files
  <area>.eval.ts       the eval definition and its scorers
```
