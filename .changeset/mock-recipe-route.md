---
"@maple-kit/core": minor
"@maple-kit/mock": minor
---

A recipe can name the route pattern it applies on: `route: "/projects/:id"`.
`parseRecipe` accepts it, and a recipe with a route mocks nothing on any other
route. A recipe without one applies everywhere, as before.
