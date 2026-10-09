---
"@maple-kit/core": patch
---

Close the open comment card, and drop its selection, when the active filter stops showing that comment. Resolving the last visible comment from its card used to leave the card expanded above "Nothing here under this filter."; the open and selected comment are now derived against the visible list, so they cannot outlive it.
