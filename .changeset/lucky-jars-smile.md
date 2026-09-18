---
"@maple-kit/core": minor
---

Add the overlay's context capture and draft storage.

`captureContext()` records the shape of the page a comment was written
against — window and content width, DPR, scheme, the named breakpoint,
locale, time zone, reduced-motion, and any layout region that was open with
its width. `formatContext()` turns that into the badge a reviewer reads.

`createDraftStore({ branch })` keeps unsent comments per branch in
`localStorage`, and keeps working in memory when a browser refuses site data
rather than taking the overlay down with it.
