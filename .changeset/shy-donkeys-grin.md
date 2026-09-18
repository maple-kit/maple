---
"@maple-kit/core": minor
---

**Breaking within 0.x:** `Comment` and `NewComment` now carry `branch`.

A store filters by branch on `list` but `append` was given no way to know which
branch a comment belonged to. The reference connector smuggled it through
`anchor.key`, which no real backend could imitate: a GitHub PR store has to
resolve a branch to a pull request before it can write anything.
