---
"@maple-kit/core": minor
---

Add the markdown exporter at `@maple-kit/core/export`.

`exportMarkdown` builds the pull-request body: a table a person reads above a
visible ` ```maple ` JSON fence an agent reads. The fence is never an HTML
comment, because the action that hands a pull-request body to an agent strips
`<!-- -->` before the model sees it.

`parseFence` reads one back, preserving fields it does not know and refusing a
version it cannot read. Over the 8 KB budget the exporter sheds detail in a
fixed order and never drops a comment; if even the smallest form is too big it
reports that rather than truncating.
