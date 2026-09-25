---
"@maple-kit/core": minor
"@maple-kit/mock": minor
---

A server can read the mock recipe. While a recipe has `flags` or `as`, a
preview's page keeps them in a `maple-mock` cookie (set by the interceptor on
install and by the box on Apply, cleared on Turn off), and
`requestRecipe(request)` from the new `@maple-kit/mock/server` subpath reads it,
or a `?maple-mock=` link in the request's own URL. The cookie never carries
`calls`, and is not written when it would exceed 4096 bytes; the interceptor
warns instead.

Core adds `RECIPE_COOKIE`, `RECIPE_COOKIE_LIMIT`, `recipeCookie` and
`readRecipeCookie` to `@maple-kit/core/mock`.

**Breaking:** `MockView.location` must also carry `protocol`, so the cookie is
`Secure` over HTTPS. `window` already does.
