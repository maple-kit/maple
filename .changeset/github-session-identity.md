---
"@maple-kit/core": patch
---

Adds `githubIdentity()` to `@maple-kit/core/auth`, an identity connector that names a reviewer by the login their GitHub session carries. A route with `githubAuth` and no `identity` wrote every comment, and showed the reviewer in the overlay, as "Guest" even though the token was theirs. Pass it as `identity` beside `githubAuth`.
