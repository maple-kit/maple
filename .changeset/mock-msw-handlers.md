---
"@maple-kit/mock": minor
---

`@maple-kit/mock/msw` and `@maple-kit/mock/node` export `mockHandlers(recipe)`:
the same resolver as MSW request handlers, for a host that already runs
`setupWorker` or `setupServer`. Put them first; a call the recipe does not name
falls through to the host's own handlers. `msw` is an optional peer.
