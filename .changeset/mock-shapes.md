---
"@maple-kit/mock": minor
---

Shapes: `resolve` and `installMock` take a `shape(key)` lookup, one JSON Schema
per call. A transform then stays inside it (a key is nulled only where it is
nullable and dropped only where it is optional, `minItems` and `maxItems` hold,
and `many` cycles enum values), and a call with no live answer and nothing
recorded is sampled from the schema alone with `sampleSchema`, deterministic
and superjson-aware. `reshape` and `reshapeTyped` take the schema as an
optional last argument.
