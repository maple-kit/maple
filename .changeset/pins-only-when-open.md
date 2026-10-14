---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Add `pins: "always" | "open"` to hide the marks on the page, and the edge indicators, until the Maple island is open. It resolves like the other viewer preferences: `?maple-pins=` in the link, then the viewer's stored choice (a new "Pins only when open" switch in the settings), then the `pins` prop, then `always`. A selected comment, an armed pick and an open composer still draw their marks. `ClientState` gains `pins` and `islandOpen`, and the controller gains `setPins` and `setIslandOpen`.
