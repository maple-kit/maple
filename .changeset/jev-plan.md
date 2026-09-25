---
"@maple-kit/classifier": minor
---

`jevClassifier().plan(request)` reads a mock request in one System One call: a
`choice` over the plan states and one `noul` question per call, with jev's own
probabilities kept as the distribution and each call's `p`. `timeoutMs`
(default 8000) sets how long any judgement may take.
