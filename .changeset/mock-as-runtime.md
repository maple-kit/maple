---
"@maple-kit/mock": minor
---

A recipe's `as` is applied. With identity rules, read from the route's
`/mock/identity` or passed as `installMock({ identity })`, the identity call's
answer carries the recipe's role and permissions, and a call the shown
identity may not make answers 403 without being sent. Writes are not blocked:
each one that reaches the server is logged as a warning and listed on
`MockHandle.writes`. `resolve` takes `identity` and `onWrite`; `impose`,
`meetsNeed`, `realIdentity` and `routeIdentity` are exported.
