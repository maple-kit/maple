---
"@maple-kit/cli": minor
---

`maple mock schema <router.ts> [--export] [--out] [--superjson]` writes an
OpenAPI document of a tRPC router's response types for Maple's route to serve
as each call's shape, marked `x-maple-mock` so the route reads it untold. It
wraps `@trpc/openapi@11.19.0-alpha`, an optional peer loaded only by this
command.

**Breaking:** `run()` returns a Promise.
