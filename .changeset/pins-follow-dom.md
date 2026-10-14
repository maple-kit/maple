---
"@maple-kit/ui": patch
---

Pins follow the page's DOM: a pin whose anchor is hidden or removed (a closed dialog) is turned off instead of parking at the page's top-left corner, anchors are re-resolved shortly after the page changes so a dialog opened later gets its pins, and a pin for content scrolled out of a scroll area is marked off.
