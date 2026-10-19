---
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

A page opened from a short mock link (`maple-mock-id`) fetches the stored recipe
from the route before its own requests go out. Matched requests are held until
`GET {route}/mock/recipes/{id}` settles, for at most `RECIPE_LOAD_TIMEOUT_MS`;
then the recipe is kept for the tab and in the cookie, and the id leaves the
address bar. If the fetch fails or times out, requests pass through unmocked and
the mock box says the shared mock could not be loaded.

Breaking: `readRecipe` returns a `RecipeReading` (`{ kind: "none" }`,
`{ kind: "found", recipe }` or `{ kind: "pending", id }`) instead of
`Recipe | undefined`. `MockHandle.recipe` is a getter that is undefined until a
short link's recipe arrives, `MockHandle.link` reports the fetch, and
`MockClientState` gains `linkFailed`.
