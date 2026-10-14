---
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

Breaking: inside `<Maple />`, `m` opens the mock box only while Maple is open, meaning the island card is up or a pick is armed. With the island collapsed it reaches the page untouched; tap the comment modifier, then press `m`. Opening the box while a pick is armed cancels the pick. The island header gains a Mock button, drawn only where the mock transport is installed, that opens and closes the box. `<MapleMock />` without `<Maple />` is unchanged. `createMockClient` takes a new `shortcutWhen` option.
