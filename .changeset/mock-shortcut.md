---
"@maple-kit/core": minor
---

`m` is a second bare-key shortcut, `MOCK_SHORTCUT`, checked by `opensMock`.
Both shortcuts now read where the key landed from `composedPath()`, so typing
`c` into a field inside a shadow root no longer starts a pick.
