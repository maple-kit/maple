---
"@maple-kit/core": minor
---

Add `@maple-kit/core/preview` with the `PreviewEnvironment` contract and a `mirrord({ env, matches })` preset that names the session a preview pod serves, from the env override, the `mirrord-key` header or an exact `mirrord-session` baggage entry. The deploy can also state the pull request (`MAPLE_PULL_REQUEST` as a bare number, or `MAPLE_REF` as `refs/pull/<n>/merge`), the exact head branch (`MAPLE_BRANCH`, or `MAPLE_REF` as `refs/heads/<branch>`) and the commit. `matches` replaces the default slug comparison for a key that is not a branch name, such as a ticket.
