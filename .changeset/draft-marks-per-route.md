---
"@maple-kit/ui": patch
---

An unsent comment only tries to place its mark on the route it was written on. The host and query string are ignored, and a draft that recorded no page is still tried everywhere. In the unsent list, a draft from another page is tagged "On another page" with a link to its path. `draftPlacements` now takes the current pathname as a third argument.
