---
"@maple-kit/core": patch
---

Anchor resolution no longer accepts a lone `data-maple-src` or `data-maple-name` match without checking its quote. A layout component renders once on every route, so its attribute is unique everywhere and a comment about one page used to resolve on every other page that shares the layout. When the anchor carries a quote, the match now has to pass it at the minimum score, its confidence is scaled by that score, and a failure falls through to the next rung or orphans the anchor as `changed`. A `key` match is still trusted as it is.
