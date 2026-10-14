---
"@maple-kit/mock": minor
---

The flags list shows only the flags the page read. `@maple-kit/mock/launchdarkly`
exports `launchDarklyUsage()`, a LaunchDarkly `flag-used` inspector (and
`launchDarklyUsageHook()` for `hooks`), to pass as
`options: { inspectors: [launchDarklyUsage()] }`. Each read is recorded as used
on the current route; the full poll is still recorded, as known. Without an
inspector the box lists every known flag, as before. `FlagRegistry.list()` is
now `known()`, and gains `recordUsed()`, `used(route)` and `hasUsed()`.
