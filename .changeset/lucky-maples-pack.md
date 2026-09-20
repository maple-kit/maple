---
"@maple-kit/core": patch
"@maple-kit/cli": patch
"@maple-kit/mcp": patch
"@maple-kit/react": patch
"@maple-kit/ui": patch
---

Every package publishes its licence, its notice and a readme. `files` was
`["dist"]` and the three texts lived only at the repository root, so the
artifact met none of Apache-2.0's redistribution terms and every npm page would
have been blank.

`@maple-kit/core` no longer carries a private copy of vitest. `/testing` imports
`describe`, `it` and `expect` for the shared connector contract suite, and with
vitest undeclared the build wrote it — and chai, expect-type, magic-string and
tinybench — into `dist/node_modules/`, about half the tarball. Worse than the
size: the suite registered its tests against that copy rather than the runner
the consumer invoked, so it collected nothing. vitest is an optional peer
dependency now, and running the contract suite means running it in your vitest.
