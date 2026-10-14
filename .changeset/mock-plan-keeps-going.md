---
"@maple-kit/core": minor
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

`/mock/plan` no longer answers 400 for a page with many or odd flags. It drops
a flag it cannot plan on its own, keeps the `MockPlanOptions.flags.limit`
(default 100) most relevant to the sentence, and answers the plan with a new
`warnings` field, which the box shows as a muted line under the input. Only a
`flags` that is not a list is still a 400. `readPlanFlags` now returns
`{ flags, warnings }`, and `PlanReading` gains `warnings`.
