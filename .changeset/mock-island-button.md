---
"@maple-kit/core": minor
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

Breaking: inside `<Maple />`, `m` opens the mock box only while Maple is open, meaning the island card is up or a pick is armed. With the island collapsed it reaches the page untouched; tap the comment modifier, then press `m`. Opening the box while a pick is armed cancels the pick. The island header gains a Mock button, drawn only where the mock transport is installed, that opens and closes the box. `<MapleMock />` without `<Maple />` is unchanged. `createMockClient` takes a new `shortcutWhen` option.

Breaking: the island's bottom "New: Element | Text | Region" row is gone, and `Maple.NewComment` and `Maple.PickButton` with it; `Maple.CommentButton` is the new part. A comment button in the header, left of the Mock button, replaces it: it arms the kind armed last (what a tap of the comment modifier arms), and pressed again while armed it moves to the next kind. The picker's bar still names the gesture and switches between the three kinds. `MapleClient` gains `armNext()`, the same call as that tap.
