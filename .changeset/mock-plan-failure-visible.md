---
"@maple-kit/mock": patch
"@maple-kit/ui": patch
---

A mock sentence that could not be planned is no longer silent. The box says it did not read the sentence, tells a refusal (401, 403) from a failure worth retrying, and leaves the calls to set by hand; the failure and its status go to the logger passed to `installMock`. `routePlan` now throws `PlanFailedError`, carrying the status, instead of a plain `Error`, and `MockClientState` gains `planFailure`.
