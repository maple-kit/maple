---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Pressing `c` while a pick is armed moves to the next kind (element, text,
region), so the key that starts a comment also changes its kind. `c` from
nothing arms the kind armed last, which is remembered per origin as
`StoredPreferences.lastPick`.

Breaking: `t` no longer cycles. `watchPickKeys` in `@maple-kit/core/overlay`
takes only `onCancel`, since `onCycle` is gone and the controller owns the key.
`PICK_ORDER` moved from `@maple-kit/ui`'s island language to
`@maple-kit/core/client`. `writePreferences` now merges into what was stored
instead of replacing it, so changing the theme no longer drops the stored
assist choice.
