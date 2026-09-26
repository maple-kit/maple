---
"@maple-kit/ui": patch
---

Hovering a mark on the page draws its ring again. React builds
`onPointerEnter` from `pointerover`, and skips it when the pointer arrives from
a node another React root manages, trusting that root to have sent the enter.
The host application's root never sees the overlay's shadow tree, so on any
React page the mark was never entered: a row in the island rang its target, the
leaf itself did not. Marks and rows now listen for `pointerover` and
`pointerout` and ignore moves between an element and its own children.
