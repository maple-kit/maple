---
"@maple-kit/core": minor
---

`POST {base}/mock/plan` reads a reviewer's sentence as a mock plan, through
`RouteOptions.mock.plan = { classifier, cacheSize?, rate? }`. It answers 404
unless `mock.preview` is true and the classifier defines `plan`, 401 to a
reviewer the identity connector does not resolve, and adds what each call's
shape says it returns to the summary the classifier reads. It shares
`/assist`'s cache and per-reviewer limiter code.

**Breaking:** `AssistRate` is renamed `RateLimit`, since `/mock/plan` takes one
too.
