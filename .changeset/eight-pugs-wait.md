---
"@maple-kit/core": minor
---

Add the overlay's host and its three ways of picking a target.

`createOverlayHost()` mounts a shadow root that takes styles only as adopted
stylesheets and pins itself with `setProperty`, which is what keeps
`docs/overlay-csp.md`'s claim true. It marks itself `data-maple-overlay`, so
the anchor cascade and the pickers all look past it.

`startElementPicking`, `startRegionPicking` and `selectedText` cover the three
kinds of comment. Each ignores the overlay's own UI, and element picking
swallows the click so picking cannot submit the page's form.
