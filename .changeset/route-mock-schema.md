---
"@maple-kit/core": minor
---

`RouteOptions.mock = { preview, schemas }` serves Maple Mock's shapes at
`GET {base}/mock/schema?key=…`, per call, only on a preview that switched it
on and only to a reviewer the identity connector resolves. `@maple-kit/core/mock`
gains the wire format, `Shape`, `JsonSchema` and `SHAPE_SOURCES`, and
`createShapeIndex`, which normalises REST and tRPC OpenAPI documents into one
shape per call key.
