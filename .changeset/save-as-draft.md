---
"@maple-kit/ui": minor
---

The composer's quiet control reads **Save as draft** instead of **Keep**, and a
saved draft keeps its leaf on the page. The leaf is drawn in the muted outline
unsent comments already used, with no number, since a draft has no address
until it is published. Pointing at it rings what it is on; clicking it opens
the composer on what was written. The draft being written is left out while
the composer is open, because the composer's own ring is already on it.

Breaking: `KEEP_LABEL` is renamed `SAVE_DRAFT_LABEL`. `MarkProps.address` is
optional, and `markLabel` and `markTitle` take a missing address and a
`"draft"` status for that leaf.
