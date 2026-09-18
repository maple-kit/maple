---
"@maple-kit/core": minor
---

Add the GitHub pull-request store connector, Maple's default store.

`githubStore({ owner, repo, token })` keeps one issue comment per Maple comment,
each carrying the human table above its ` ```maple ` fence, so GitHub's own
threading, notifications and permissions do the work. A comment id encodes the
pull request, so `setStatus` needs no index and works in a process that never
listed.

It passes the shared store contract. Every call it makes has an msw handler,
including a rate-limit error and a non-JSON gateway error.
