---
"@maple-kit/core": patch
"@maple-kit/ui": patch
---

Region pick works on touch: the drag shield sets `touch-action: none`, and a `pointercancel`, a lost pointer capture or a move with no button down abandons the band instead of leaving a phantom one that follows the next move. `RegionPickingOptions.onDraw` now also receives `undefined` when a drag is abandoned.
