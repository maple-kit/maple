---
"@maple-kit/mock": minor
---

`installMock({ route: "/api/maple" })` reads each call's shape from Maple's
route as it is needed, batched and cached, and never records or mocks anything
under that path. `routeShapes` is the same lookup on its own. `MockHandle.shape`
and a row's `source` let the box say where each shape came from. `Shape`,
`JsonSchema` and `SHAPE_SOURCES` now come from `@maple-kit/core/mock`.
