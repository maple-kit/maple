---
"@maple-kit/core": minor
"@maple-kit/classifier": minor
"@maple-kit/mock": minor
"@maple-kit/ui": minor
"@maple-kit/cli": patch
---

A mock plan sets flags and who the page is shown as. `MockPlanRequest` takes
the page's `flags` (`{ key, type, variants? }`) and the host's `roles`, and
`MockPlan` answers one `PlannedFlag` per flag and a `PlannedRole`. The route
adds the roles from its own identity rules, drops a flag with no values, and
keeps an answer to what was listed. `readPlan` carries named flags and a role
on each suggestion, or as a suggestion of their own. The keyword planner reads
them without ever taking a key from the sentence, `jevClassifier` asks for them
in a second request so the state and calls are judged as before, the box sends
the flags it saw and applies a layered chip, and `maple mock plan` prints them.
`plannedFlag` and `flagValues` are exported from `@maple-kit/core/connectors`,
and `memoryClassifier` takes `planFlags` and `planRole`.

**Breaking:** `MockSuggestion.state` is optional, since a chip may name only a
flag or a role, and `createMockPlanner` takes the route's mock schemas rather
than a shapes lookup.
