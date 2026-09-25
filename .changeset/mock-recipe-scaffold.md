---
"@maple-kit/core": minor
"@maple-kit/mock": minor
---

**New package, `@maple-kit/mock`**, and a new core subpath,
`@maple-kit/core/mock`: the first piece of Maple Mock (#166).

`@maple-kit/core/mock` exports the recipe — the record of which calls a mock
rewrites and into which state — with `parseRecipe`, `InvalidRecipeError`,
`MOCK_STATES` and `RECIPE_VERSION`.

`@maple-kit/mock` reads and writes an active recipe: `readRecipe`,
`saveRecipe`, `forgetRecipe`, `linkRecipe`, `encodeRecipe` and `decodeRecipe`.
Its `./install`, `./msw` and `./node` entries exist and are empty; the
interceptor and codecs land next.

Nothing existing changed.
