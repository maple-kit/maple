---
"@maple-kit/core": minor
---

`exportMarkdown` can write the table without the fence.

`{ fence: false }` returns the table alone, with `bytes: 0` and nothing shed.

It exists because a second fence on one pull request is a second comment.
`githubStore.list` reads every issue comment that carries a fence, so a summary
repeating them all is read back as one more comment — with an id nothing can
resolve, because it points at the summary rather than at what a reviewer
clicked. It would hold the gate for ever, which is precisely the failure the
gate's contract suite exists to prevent.

The action's `sync` mode is the first caller: the summary it keeps on the pull
request is a table, and the fences an agent reads are the ones on the individual
comments. `docs/connectors.md` records the rule.
