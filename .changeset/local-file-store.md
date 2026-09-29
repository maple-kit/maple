---
"@maple-kit/core": minor
---

Add `fileStore()` and `fileMedia()` to `@maple-kit/core/connectors`: a store and a media connector that keep a branch's comments and screenshots as plain files in `.maple/<branch-slug>/comments.json` and `.maple/<branch-slug>/media/<key>.<ext>`, with no server and no new dependency.

The folder is keyed by the branch checked out in the working directory, falling back to the normalized URL (`localhost:3000` becomes `localhost-3000`) when there is no repository or HEAD is detached. It is rooted at the main checkout through `git rev-parse --git-common-dir`, so every worktree shares one `.maple/`. Writes are atomic. `@maple-kit/core/testing` also gains `runMediaContract`, the contract suite for media connectors.

Nothing that existed changed.
