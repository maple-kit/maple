---
"@maple-kit/core": patch
---

A pull request with many visual comments no longer pushes its Maple comment past GitHub's 65,536-character limit because of the table. The table now takes what the fence leaves: when rows do not fit, resolved ones are left out first, then the newest, and a line under the table says how many. The fence below it still carries every comment. `exportMarkdown` takes a `bodyLimit` for this, and its result reports `omitted`.
