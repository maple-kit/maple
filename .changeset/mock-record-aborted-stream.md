---
"@maple-kit/mock": patch
---

A streamed tRPC batch the page let through is recorded again. tRPC's stream
link aborts its request once the last call has answered, which errored the
interceptor's copy of the body before it was read, so the inventory stayed
empty on every page using `httpBatchStreamLink`. The copy is now read from the
moment it arrives, and what was read before the abort is kept.
