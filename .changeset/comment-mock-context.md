---
"@maple-kit/core": minor
---

A comment written while a mock is on records it as `context.mock`: the recipe's
calls and states, its route and the sentence behind it. `captureContext` reads
it through `activeRecipe()`, which finds `@maple-kit/mock`'s handle by
`MOCK_HANDLE_KEY` without importing it. The fence reads the recipe through
`parseRecipe` and drops one it cannot read, sheds it first when over budget
(the new `"mock"` reduction), and the ledger row says `mocked`. The fence stays
version 1.
