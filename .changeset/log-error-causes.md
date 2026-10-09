---
"@maple-kit/core": patch
---

`consoleSink` and `streamSink` now print a logged error's `cause` chain, one "Caused by:" line per link. A `MapleStoreError`'s own message is generic, so the store's real failure (a GitHub 403, a missing pull request) was never in the log.
