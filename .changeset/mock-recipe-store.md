---
"@maple-kit/core": minor
---

Add a recipe store for short Maple Mock links. `RouteOptions.recipes` takes a
`RecipeStore` (`put(recipe, { expiresAt })` and `get(id)`), and the route gains
`POST /mock/recipes` and `GET /mock/recipes/{id}`, gated like the other
`/mock/*` routes and rate limited like `/mock/plan`. A stored recipe drops the
reviewer's typed `request`, is capped at 16 KB, gets a 128-bit random id and
expires after `mock.recipes.ttlDays` (30 by default). `r2Recipes()` is exported
from `@maple-kit/core/connectors` and `fileRecipes()` from `@maple-kit/core/local`;
`runRecipeContract()` and `memoryRecipes()` come from `@maple-kit/core/testing`.
