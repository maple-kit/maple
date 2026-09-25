---
"@maple-kit/core": minor
---

`ClassifierConnector.plan?(request)` reads a mock request as a plan: the state
it names (or `none`), a distribution over the states, a confidence, and one
verdict per call the route made. `keywordClassifier()` and `memoryClassifier()`
implement it, `runClassifierContract` checks it, and `MOCK_PLAN_STATES`,
`stateFromWeights` and `plannedCall` serve a planner with no probabilities of
its own.

**Breaking:** `CONNECTOR_METHODS.classifier` lists `plan`, so a
`CapabilityReport<"classifier">` has a `plan` field, and `memoryClassifier()`
defines `plan` unless `methods` leaves it out.
