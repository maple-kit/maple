---
"@maple-kit/mock": patch
---

A `loading` call held on Node, as by the `@maple-kit/mock/node` handlers, now
settles when its request is abandoned after a garbage collection. Node links a
`Request`'s signal to the caller's only weakly, so a held request nothing else
referenced could be collected and never hear the abort.
