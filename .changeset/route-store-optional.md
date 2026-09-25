---
"@maple-kit/core": minor
---

**Breaking:** `RouteOptions.store` is optional. Without one, the comment and
approval endpoints answer 404, the way `/assist` does without a classifier, so
a host that only mocks can mount the route. Code that reads `options.store`
off a `RouteOptions` now has to handle `undefined`.
