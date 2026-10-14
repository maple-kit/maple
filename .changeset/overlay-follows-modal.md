---
"@maple-kit/core": patch
---

The overlay now works while the host page has a modal open: Maple's host element moves inside the topmost open modal dialog (native `showModal()` or `role="dialog" aria-modal="true"`) and back when it closes, so the island and composer stay visible, focusable, and are not treated as an outside click.
