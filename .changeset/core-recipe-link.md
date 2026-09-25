---
"@maple-kit/core": minor
"@maple-kit/mock": minor
---

`encodeRecipe`, `decodeRecipe`, `linkRecipe` and `RECIPE_PARAM` move to
`@maple-kit/core/mock`, beside the recipe whose wire format they are, so a
server replaying a comment's mock builds the same link the page reads.

**Breaking:** `@maple-kit/mock` no longer exports them; import them from
`@maple-kit/core/mock`.
