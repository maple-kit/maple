---
"@maple-kit/ui": minor
"@maple-kit/core": minor
---

Rework the island's status line and drafts.

- Drafts are a status: `drafts` joins `COMMENT_FILTERS` in `@maple-kit/core/client` (`matchesFilter` is false for it, since no stored comment is a draft), and the island lists unsent comments under it with the same row as every comment. `Maple.Unsent` is now one line, "Some comments are unpublished", with a Publish split button whose menu copies Markdown or JSON to the clipboard; the file download, the per-draft "On another page" link and the solo offer on that surface are gone. `countsFor` takes the draft count as a third argument.
- Import drafts is an icon-only button beside the status select, and the sign-off is a green check-circle at the end of the same line. `Maple.Filters` now holds the new `FilterPick`, `ImportDrafts`, `FilterTally` and `Approve` as children, and `Approve` renders a button, not a row.
- A load that failed shows an illustrated state with a retry instead of one sentence.
- The explanatory tooltips are removed (status, name, leaf, tally, attachment, picks, themes) along with their copy, the `Tip` component and `tipSpot`; a timestamp keeps its exact time as a native title.
