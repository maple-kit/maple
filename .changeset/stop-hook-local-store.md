---
"@maple-kit/mcp": minor
---

`maple-stop-hook` reads the local store when no forge is configured: with neither `MAPLE_GITHUB_OWNER` nor `MAPLE_GITHUB_REPO` set it blocks on the open comments under `.maple/` for the checked-out branch, as it does for GitHub, so the agent loop works on a laptop with no pull request. It still lets every stop through where there is no `.maple/` folder, no comments for the branch or no git repository, and never creates the folder. A `MAPLE_STORE=github` with no repository named is still a no-op. Minor rather than patch: a hook that stayed silent in a project with `.maple/` comments now blocks there.
