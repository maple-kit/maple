---
"@maple-kit/core": patch
---

The overlay host now mounts on `<html>` after `<body>` instead of inside it, so a `transform`, `filter` or `contain` on the body no longer mispositions it and a swapped `document.body` (Turbo Drive, htmx boost) no longer removes it. A detached host is re-appended.
