---
"@maple-kit/core": patch
---

The text index no longer runs block text together. A space now separates text from different block-level elements (and after a `<br>`), and runs of whitespace collapse to one, so a stored quote reads "How to dial in your espresso Grind size" and not "espressoGrind", and survives a reflow that only changes wrapping. Segment offsets still map to real DOM positions: a separator belongs to no node, and collapsed whitespace is mapped back to the characters it came from. Quotes stored before this change have no separators and still resolve, through the quote matcher's tolerance.
