---
"@maple-kit/core": minor
---

The pull-request body a comment lands in is branded: the wordmark above it, a
line naming who wrote the table, a line saying the fence is the full detail to
copy into an agent, and `powered by Maple` under a rule at the foot.

The chrome is unconditional and takes no option, including for the summary
`exportMarkdown(…, { fence: false })` builds. A caller that was matching on the
exact body — the table as the first line, or the fence last — now needs to
match on the table or the fence itself; `parseFence` is unchanged and still
finds it anywhere in the body. The fence's byte budget is untouched: `bytes`
and `reduced` still describe the fence alone.
