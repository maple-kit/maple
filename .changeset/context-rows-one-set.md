---
"@maple-kit/core": patch
"@maple-kit/ui": patch
---

The composer's context card shows the same page-environment rows in every detail mode: Width (with the covered amount), Content, Breakpoint, Theme, Pixel ratio, Locale and Open, each hidden when its value was not captured. Developer detail adds only the rows about how Maple anchored the comment. **Breaking:** `contextRows(context, detail)` no longer takes a `detail` argument, and the developer-only labels "Window", "Scheme" and "DPR" are gone in favour of the plain ones.
