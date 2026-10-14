---
"@maple-kit/cli": minor
---

Add `maple setup preview mirrord [--write]`: it adds `feature.env.override` (`MAPLE_PREVIEW_KEY`, `MAPLE_PULL_REQUEST`, `MAPLE_BRANCH`, `MAPLE_REF`, `MAPLE_COMMIT`, templated from `-k` and GitHub Actions' own variables, so no workflow step is needed there) and steal mode to each preview config in `.mirrord/*.json` (a file named `*preview*`, or one with a top-level `key` or a `feature.preview` section), leaves values that are already set alone, lists the configs it skipped, and runs `mirrord verify-config --resolved` after a write when `mirrord` is installed, on a temp copy with a literal `key` when the file's own is missing or a template (on Windows it looks for `mirrord` with each `PATHEXT` extension).
