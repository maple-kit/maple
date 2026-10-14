---
"@maple-kit/core": patch
"@maple-kit/mock": patch
---

The `m` shortcut no longer opens the mock box while you type. `opensMock` and `isEditable` now read the whole event path: `role=textbox`, `combobox` and `searchbox` elements, `contenteditable` ancestors and editors inside open shadow roots count as typing. A held `m`, an IME composition and keyCode 229 no longer open or toggle the box. The comment tap's text-field check uses the same path.
