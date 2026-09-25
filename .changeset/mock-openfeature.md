---
"@maple-kit/mock": minor
---

`withMockFlags(provider)` from `@maple-kit/mock/openfeature` answers the flags
a recipe names and delegates the rest, for a web or a server OpenFeature
provider, and holds back the provider's change events for an answered flag.
Every evaluation is recorded with its real value in `seenFlags()`.
`@maple-kit/mock/testing` has `runFlagProviderContract` and
`memoryFlagProvider`; `vitest` is an optional peer, needed only there.
