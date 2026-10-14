---
"@maple-kit/ui": patch
---

Closing the composer returns focus to the page control that had it when the composer opened, so a keyboard user no longer lands on `<body>`. Focus is left alone if that control is gone or the viewer already moved it.
