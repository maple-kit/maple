---
"@maple-kit/core": minor
---

Add the anchor cascade at `@maple-kit/core/anchor`.

`describeElement` and `describeRange` record every rung a page can supply —
`data-maple-key`, `data-maple-src`, `data-maple-name`, a text quote with its
surrounding context, and a CSS path. `resolveAnchor` tries them most durable
first and reports which one placed the comment and how far it is trusted.

When no rung works the answer is an orphan carrying a reason — `empty`,
`missing`, `ambiguous` or `changed` — never the nearest ancestor. About a
quarter of anchors orphan over time, so saying so is the feature.
