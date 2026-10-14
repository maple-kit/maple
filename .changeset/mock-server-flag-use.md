---
"@maple-kit/core": minor
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

Flags the server read show in the mock box. `@maple-kit/core/flags` exports
`recordFlagUse(key)` and `withFlagUse(handler)`, which set `x-maple-flags` on the
response (comma-separated, URL-encoded keys, 4 KB cap) while the Maple route has
`mock.preview` on, and collect nothing otherwise. `@maple-kit/core/launchdarkly`
has `launchDarklyFlagUse()`, a Node server SDK `afterEvaluation` hook.
`@maple-kit/core/mock` exports the header's name and codec. The interceptor
records the header's keys as used with source "server", and the box tags them
"server" because a mocked value applies after a reload.
