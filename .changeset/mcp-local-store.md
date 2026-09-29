---
"@maple-kit/mcp": minor
---

The server reads and resolves comments from `.maple/` when no forge is configured. `MAPLE_STORE` now accepts `file` as well as `github`; unset, it is `github` when any of `GITHUB_TOKEN`, `MAPLE_GITHUB_OWNER` or `MAPLE_GITHUB_REPO` is set and `file` when none is, so an agent on a laptop works with no pull request.

Breaking: a server started with none of those variables used to exit at startup naming the missing one, and now starts on the local store instead. `storeFromEnvironment` takes an optional second argument, the directory whose repository names the folder.
