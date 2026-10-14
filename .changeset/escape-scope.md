---
"@maple-kit/core": patch
"@maple-kit/ui": patch
"@maple-kit/mock": patch
---

Escape no longer reaches past Maple. It closes Maple's topmost layer (a pick, then the composer, settings, the island) only when focus is inside Maple or a pick is armed, and then it is consumed, so a host `<dialog>` is not closed by the same press and one press closes one layer. Escape while Maple is idle or during IME composition is left alone. Clicking any part of the island now moves focus into it, so Escape works afterwards. Tapping Shift with the comment modifier (Shift+Cmd on a Mac, Shift+Ctrl elsewhere) closes Maple from anywhere and keeps drafts.

Breaking: `watchEscape`'s `onEscape` now receives the event and returns whether it closed something, and takes an optional `takesAll`; `watchPickKeys` and `PickKeyOptions` are removed from `@maple-kit/core/overlay` (the picker uses `watchEscape`); `TapNotice` gains `close`; `TapState` gains `chord`, and `tapStep` reports `close`.
