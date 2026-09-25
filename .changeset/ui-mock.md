---
"@maple-kit/ui": minor
---

`<MapleMock />` at the new `@maple-kit/ui/mock` entry: Maple Mock's box and a
banner that only Turn off removes, opened with `m`. On its own it mounts a
shadow host of its own with `MOCK_CSS`; inside `<Maple />` it is already there
as `Maple.Mock`, and it draws nothing on a page where no transport is
installed. The adopted stylesheet's budget rises from 14 KB to 15 KB for the
box's rules.
