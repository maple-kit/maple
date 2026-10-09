---
"@maple-kit/ui": minor
"@maple-kit/core": minor
---

The island's card can be resized in width and height (corner and side handles, pointer and arrow keys, Home to reset), from its default size, which is also its least, up to the viewport. The size is remembered per origin: `ClientState.islandSize`, `client.setIslandSize()` and a stored `islandSize` preference are new in `@maple-kit/core/client`, and `ClientState` gains a required field.

Marks are pinned to what they are on: they follow the anchor exactly as the page scrolls, with no clamp to the viewport edge. A mark whose anchor has left the viewport is hidden and an edge indicator (the logo, an arrow and a count) points the way; clicking it scrolls the nearest hidden comment into view. Breaking: `culled` and `viewportHeight` are replaced by `edgeOf` and `pageView` in the marks entrypoint, and `markSpot` takes the page's scroll offset.
