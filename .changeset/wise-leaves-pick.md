---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Picking works end to end, and one import mounts all of it.

`Maple.Picker` in `@maple-kit/ui/picker` runs the gesture an armed pick starts
and opens the composer on what it finds — until now `arm()` set a flag nothing
read. `@maple-kit/ui/maple` exports `<Maple branch="…" />`, the whole reviewer
interface as one element, for an application that wants the default.

A screenshot of the page is taken at pick time, before the panel insets the
layout it is over, and lands in the composer on its own; paste and drop
override it and there is no button for either. Clicking a comment opens the
panel on it to read, with the context badge and the screenshot a row cannot
carry. Escape shuts the newest surface first: the panel, then the settings,
then the island.

The overlay's scheme and the island's corner are now the viewer's, remembered
per origin and settable from the island's settings: `client.setTheme()`,
`?maple-theme=`, and a corner picker beside it.

**Breaking:** `PartForm` is now `"outline" | "partial" | "solid"` — a leaf
fills up as a comment goes through its life rather than emptying out, so open
is an outline, re-verify is half and resolved is full. `useOverlayScheme()`
takes no argument and reads the viewer's preference from the controller.
`MapleAttachments` no longer takes `capture`, and `Tip` moved from
`@maple-kit/ui/island` to the package root.
