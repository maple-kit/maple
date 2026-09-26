---
"@maple-kit/core": patch
---

A comment on one of two copies of a component (a `planned` badge in each of two
cards, with the same source line, name and text) now comes back on the copy
that was picked. Before, the first copy on the page won every time. When
several elements match the key, source or component rung, each one is now
scored with the text recorded around it. An exact tie falls to the recorded
offset, then to the recorded selector.
