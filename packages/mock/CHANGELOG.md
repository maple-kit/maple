# @maple-kit/mock

## 0.9.0

### Minor Changes

- 9371621: `@maple-kit/mock/msw` and `@maple-kit/mock/node` export `mockHandlers(recipe)`:
  the same resolver as MSW request handlers, for a host that already runs
  `setupWorker` or `setupServer`. Put them first; a call the recipe does not name
  falls through to the host's own handlers. `msw` is an optional peer.
- 9371621: A recipe can name the route pattern it applies on: `route: "/projects/:id"`.
  `parseRecipe` accepts it, and a recipe with a route mocks nothing on any other
  route. A recipe without one applies everywhere, as before.
- 8cfc7b5: **New package, `@maple-kit/mock`**, and a new core subpath,
  `@maple-kit/core/mock`: the first piece of Maple Mock (#166).

  `@maple-kit/core/mock` exports the recipe — the record of which calls a mock
  rewrites and into which state — with `parseRecipe`, `InvalidRecipeError`,
  `MOCK_STATES` and `RECIPE_VERSION`.

  `@maple-kit/mock` reads and writes an active recipe: `readRecipe`,
  `saveRecipe`, `forgetRecipe`, `linkRecipe`, `encodeRecipe` and `decodeRecipe`.
  Its `./install`, `./msw` and `./node` entries exist and are empty; the
  interceptor and codecs land next.

  Nothing existing changed.

- 1600f2f: **`@maple-kit/mock` rewrites REST responses in the page.**

  `import "@maple-kit/mock/install"` wraps `fetch` and `XMLHttpRequest` over
  `@mswjs/interceptors`, with no service worker. `installMock(options)` is the
  same with a logger and an `ignore`. The active recipe is read once at install,
  from `?maple-mock=` or the tab.

  A call the recipe names is answered in its state and every other call keeps
  the server's answer. `empty`, `one` and `many` reshape the server's own JSON,
  keeping envelope keys, and fall back to the last recorded answer when the
  server fails. `error` and `forbidden` answer 500 and 403 without sending the
  request, and `loading` holds it.

  Also exported: `resolve`, `restCodec`, `restKey`, `pathPattern`, `reshape`,
  `createInventory`, and the `Codec` contract.

- 9371621: **`@maple-kit/mock` mocks tRPC**, batched, streamed and with superjson.

  `trpcCodec({ endpoint, transformer })` is a default codec, before REST, at
  `/api/trpc`. `/api/trpc/a,b?batch=1` is two calls, `trpc:a` and `trpc:b`. A
  partial mock sends the real batch and replaces only the named calls, leaving
  the rest byte for byte and recomputing a 207. A `httpBatchStreamLink` batch is
  fetched plain and written back as tRPC's own JSONL. superjson annotations stay
  true through `empty`, `one` and `many`.

  The `Codec` contract gains an optional `prepare(request)`, and an `Answer` an
  optional `meta`. `reshapeTyped` is new beside `reshape`.
  `installMock` takes `codecs`.

### Patch Changes

- b84f8e1: A `loading` call whose request is abandoned before the interceptor gets to it
  now settles, instead of being held forever.
- 0d957fd: A page can close a stream the interceptor let through. The interceptor's copy
  of a response it did not read, such as a server-sent event stream read over
  `fetch` or `XMLHttpRequest`, is now cancelled. Before, the page's own `cancel()`
  never settled, and the server kept the stream open for as long as it ran.
- Updated dependencies [9371621]
- Updated dependencies [8cfc7b5]
  - @maple-kit/core@0.9.0
