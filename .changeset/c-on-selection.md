---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Pressing `c` with text already selected on the page opens the composer on that
passage, as if it had been selected through Maple's text pick. A text pick
armed over an existing selection commits that selection straight away, which
also covers arming Text from the island. A text pick taken from a selection is
not remembered as the viewer's chosen kind, so the next `c` with nothing
selected still arms the kind they picked last. `selectedText()` in
`@maple-kit/core/overlay` takes an optional document.
