---
"@maple-kit/mock": minor
---

`installMock({ flags })` takes flag sources: a vendor's flag request, read for
`seenFlags()` and answered with the recipe's flags, and its stream, held
through a wrapped `EventSource`. `launchDarklyFlags({ baseUri?, streamUri? })`
from `@maple-kit/mock/launchdarkly` is LaunchDarkly's browser SDK: its
`/sdk/evalx/` poll, and its stream's `put`, `patch` and `delete`. `FlagSource`,
`holdStreams` and `flagType` are exported for another vendor's source.
