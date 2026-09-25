---
"@maple-kit/core": minor
---

`RouteOptions.mock.identity` declares who a reviewer is for a recipe's `as`:
the call that says so, its role and permission fields by dotted path, and what
each call needs (`requires`). `GET {base}/mock/identity` serves the rules with
each vocabulary filled in from the call's shape, gated as `/mock/schema` is.
`identityRules` and `isIdentityRules` are in `@maple-kit/core/mock`.
