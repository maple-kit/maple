---
"@maple-kit/ui": patch
---

Rename the island's first filter pill from "All" to "Active". With resolved comments hidden it counts only the unresolved ones, so a review with every comment resolved read "All 0". The `all` filter key in `@maple-kit/core/client` is unchanged: it still means no status narrowing.
