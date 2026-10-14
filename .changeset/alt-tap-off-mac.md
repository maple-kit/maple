---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Breaking: off a Mac, a bare Alt tap starts a comment, not a Ctrl tap, and Shift+Alt closes Maple, not Shift+Ctrl. Screen reader users tap Ctrl to silence speech, and each tap started a comment. `TapModifier` is now `"Meta" | "Alt"` (was `"Meta" | "Control"`), `commentModifier()` returns `"Alt"` on Windows and Linux, and the hints read "Tap Alt". AltGr never counts as a tap, a text field still swallows it, and a consumed Alt tap cancels its keyup so Chrome and Firefox on Windows do not focus the menu bar. macOS is unchanged: Cmd.
