---
"@maple-kit/core": minor
"@maple-kit/mock": minor
---

A plan request no longer grows with the page. `routePlan` gzips the body (`Content-Encoding: gzip`) where the browser has `CompressionStream`, and sends the recorded calls in consecutive batches of at most about 6 KB on the wire, then merges the readings, so no request approaches the 8 KB a managed web application firewall rule allows. `POST /mock/plan` inflates a gzipped body (up to 512 KB inflated) and still reads a plain one; any other `Content-Encoding` answers 415. A sentence on a busy page now spends one plan of the per-session rate limit for each batch.
