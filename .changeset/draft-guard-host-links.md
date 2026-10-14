---
"@maple-kit/core": patch
---

The draft guard no longer intercepts links the host handles. It now decides in the bubble phase, after the host's handlers, so a router `Link` or an `onClick` that calls `preventDefault` is left alone, and hash-only links on the current page are skipped. Only a plain full-page navigation is still asked about.
