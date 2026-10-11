---
"@maple-kit/core": minor
---

Add `runRulesContract` and `memoryRules` to `@maple-kit/core/testing`: the shared contract suite for the `rules` connector kind, and a deterministic in-memory `RuleConnector` to run it against. The suite checks that a finding names a declared rule, is marked `judged`, carries the rule's severity (`advice` by default) and is anchored on an element the host sent, that an empty request finds nothing, and that a failure rejects with a plain `Error`. `memoryRules({ rules, violation, failWith })` decides violations from a function and records the requests it was asked.
