---
"@maple-kit/core": patch
---

A quote's `prefix` and `suffix` no longer reach into page chrome. Context is now drawn from inside the pick's `main` or `[role=main]`, or the tagged component around it, and text under `nav`, `header`, `aside` and `[data-maple-private]` is left out unless the pick is inside it. Before, a pick at the top of the main content carried whatever preceded it in the document, often the signed-in reviewer's name, into the stored draft, the Markdown export and the published comment.
