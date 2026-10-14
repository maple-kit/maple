---
"@maple-kit/ui": patch
---

The mock box's state menu now drops its scroll listener whenever it closes (a pick, Escape, a click outside), not only when the box scrolls, so reopening the menu no longer stacks stale listeners.
