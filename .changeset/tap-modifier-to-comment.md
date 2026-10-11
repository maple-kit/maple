---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Breaking: a bare `c` no longer starts a comment. A reviewer taps the platform modifier alone instead: Cmd on macOS and iOS, Ctrl elsewhere. A bare letter fails on non-Latin layouts (the Hebrew `c` key types another character); a lone modifier tap works on any layout. A tap does not fire when another key, a pointer press or a wheel turn happens while it is down, when it is held for 500 ms or more, when another modifier is held, when the window blurs, or when focus is in a field. Over a selection a tap picks that passage, and tapping again while picking cycles the kind, as `c` did. The mock box's `m` is unchanged.

`@maple-kit/core/client`: `opensComposer` and the comment-key constant are removed. `watchCommentTap`, the pure `tapStep` state machine, `commentModifier` and `commentTapLabel` replace them. The `shortcut` prop, `MapleProps.shortcut` and `MapleConfig.shortcut` are removed; the binding is not configurable, and there is no replacement option. `@maple-kit/ui`: `PICKER_COPY.cycle` is replaced by `cycleHint()`, which reads "Tap ⌘ to switch" or "Tap Ctrl to switch" and is the tooltip on the pick kinds.
