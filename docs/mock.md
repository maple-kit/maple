# Mock: showing a page in the state a reviewer asked for

The states that most need a visual review are the hardest to reach on a
preview: empty, error, forbidden, loading, one item, a thousand items. Maple
Mock lets a reviewer name the state, and rewrites the page's API responses into
it. The tracking issue is #166; the open questions are in Discussion #174.

This file records decisions as they land. It says what exists, not what is
planned.

## A model picks, code writes every byte

A model may be asked which state was meant and which calls it concerns. It is
never asked to write a response body. A transform reshapes a response the page
has already received, or one sampled from its schema, so the app's own parser
still accepts the result. A generated payload would be valid only by luck.

Nothing in the runtime calls a model.

## Where the pieces live

| Piece                                           | Home                      |
| ----------------------------------------------- | ------------------------- |
| The recipe type and its validator               | `@maple-kit/core/mock`    |
| Interceptor, codecs, transforms, recipe storage | `@maple-kit/mock`         |
| The one-line install                            | `@maple-kit/mock/install` |

**A package, not a core subpath.** The interceptor is imported from a host's
entry before its first request, and a host that does not mock should not carry
it. A host that only mocks installs `@maple-kit/mock` and never loads the review
overlay.

**The recipe type is in core** because the comment fence will carry it, and the
fence is core's. The writer and the reader of a format share one validator and
ship in one release, which is the lesson of a reader pinned to an older core
that read a newer format and passed.

**`@maple-kit/mock` has no React and no Effect**, and never imports
`@maple-kit/ui` or `@maple-kit/react`. They depend on it through their own
`./mock` subpaths. A lint rule enforces the direction.

## The recipe

```ts
{
  version: 1,
  calls: [{ key: "trpc:project.list", state: "empty" }],
  request: "mock this page with an empty state",
}
```

- **A call is named by a key its codec owns**, prefixed with the codec's name:
  `rest:GET /api/projects/:id`, `trpc:project.list`. Core checks only the
  prefix; the grammar after the colon is the codec's.
- **A call not named passes through.** A mock is a list of exceptions to the
  real server, never a replacement for it. Mutations are no different: one is
  mocked only if the recipe names it.
- **The states are a closed set**: `empty`, `error`, `forbidden`, `loading`,
  `one`, `many`. A state outside it is refused rather than ignored, since a
  recipe that silently mocks less than it says is worse than one that fails.
- **Unknown fields are dropped, a newer version is refused.** Dropping lets a
  later layer be added to the record without an older reader rejecting it.
  Refusing a newer version stops a reader half-applying a format it does not
  know.
- **`request` is the reviewer's words**, kept for display. Nothing reads it to
  decide what to mock.

`parseRecipe` returns a fresh copy and throws `InvalidRecipeError` listing
every problem at once.

## Applying a mock reloads the page

The recipe is written to `sessionStorage` and to the `?maple-mock=` parameter,
and the page reloads. Patching a client's query cache in place would mean one
integration per data library, each of them fragile; a reload makes every
library fetch again through the interceptor.

- **The link wins over the tab.** Opening a shared link shows what was shared,
  even in a tab that had another mock on.
- **The tab keeps it through navigation** that drops the query string.
- **The parameter is base64url of the JSON**, so it survives any router that
  re-encodes the query.

`readRecipe` throws on a recipe it cannot read rather than returning nothing,
so the caller decides whether to drop it. A broken link that silently shows
real data looks exactly like a working mock of a page with real data.

## The interceptor

`import "@maple-kit/mock/install"` from the app's entry, before its first
request, wraps `fetch` and `XMLHttpRequest` in the page. `installMock(options)`
from `@maple-kit/mock` is the same with a logger and an `ignore` for requests
that are not the page's data, such as Maple's own route.

- **No service worker.** It is built on `@mswjs/interceptors`, the layer MSW
  runs on, which patches the page's globals. Nothing is served from the host's
  origin and `docs/overlay-csp.md` still holds.
- **Preview builds only** is the host's build switch, the same one that keeps
  the overlay out of production. `examples/vite-app` imports it behind a
  build-time constant, and its `verify` script checks that a production build
  carries none of it.
- **With no recipe it changes nothing.** Every request goes through untouched,
  and its answer is recorded.

## Resolving a request

A **codec** takes one HTTP exchange apart into logical calls and puts it back
together: `split(request)`, `read(response)` and `join(calls, answers)`. `read`
is `split` for the response. An optional `prepare(request)` rewrites the
request sent on when its response will be rewritten. Everything a protocol does
differently stays inside those, so nothing else in the package reads a URL or a
header.

The default codecs are tRPC at `/api/trpc`, then REST. `installMock({ codecs })`
replaces them, for example with `trpcCodec({ endpoint: "/trpc" })`.

For each request, the calls the recipe names are answered and the rest keep
the server's answer:

| State                  | What is sent to the server | What the page gets                            |
| ---------------------- | -------------------------- | --------------------------------------------- |
| not named              | the request, as it was     | the server's answer                           |
| `error`, `forbidden`   | nothing                    | 500 or 403, in the protocol's own error shape |
| `loading`              | nothing                    | nothing, until the request is abandoned       |
| `empty`, `one`, `many` | the request, as it was     | the server's own answer, reshaped             |

- **A body state reshapes the live answer**, so the mock is as fresh as the
  page. When the server fails, the last recorded answer is reshaped instead;
  with neither, the server's failure goes through as it came.
- **A failure never reaches the server.** A mutation named `error` is a write
  the server never sees, which is the state the reviewer asked to look at.
- **A response the codec cannot read goes through untouched.** A body state on
  an HTML page is a mistake in the recipe, not a reason to break the page.

## The REST codec

One request is one call. Its key is the method and the path, with identifiers
collapsed: `rest:GET /api/projects/:id`. A segment is an identifier when it is
all digits, a UUID, a ULID, or sixteen or more hex characters with a digit
among them. The query string is not part of the key.

It is the last codec tried and claims every request that reaches it, but reads
only a JSON response, so a script or an image is never recorded or reshaped.

## The tRPC codec

`/api/trpc/project.list,user.me?batch=1` is two calls, `trpc:project.list` and
`trpc:user.me`. Input is not part of the key. A single call without batching,
a GET query and a POST mutation are all read the same way.

**A partial mock is a splice.** The real batch is still sent, and only the
named calls are replaced in the answer, so the server stays the truth for
everything the reviewer did not ask to change. The batch status is recomputed
as tRPC computes it: one status if every item agrees, 207 if they differ. An
item the mock did not touch is written back byte for byte as the server wrote
it; the suite checks that against tRPC's own server, not against this codec.

**A streamed batch (`httpBatchStreamLink`) is fetched plain and written back
as a stream.** The forwarded request drops `trpc-accept`, so the server answers
one JSON array, and the codec writes the JSONL the client asked for: the head,
failed calls, then each level of the rest, in the order tRPC's own producer
writes them for calls that settle at once. Every line of a partly mocked stream
but the mocked one matches the server's own stream exactly. What is lost is
streaming itself: the page gets every call when the slowest has answered.

**A stream the page receives unmocked is read without holding it.** Recording
reads a copy of the response after the page has it, because the interceptor
would otherwise wait for the whole stream before handing it over.

**superjson is read from the answers**, as the `{ json, meta }` envelope.
`meta` says which values were a `Date`, a `bigint` or a `Map`, by path, and a
transform keeps it true: an emptied list drops its items' annotations, a
repeated item repeats them. Referential equalities are kept on an untouched
answer and dropped from a reshaped one. In a stream each line is serialised
whole, so an answer's annotations move under `2.0.0` of its line, and back.

**A failure nothing was fetched for** borrows the envelope the call was last
recorded in. A call never seen, failed without a request, has no answer to
learn from; `trpcCodec({ transformer: "superjson" })` says it up front.

The error written is tRPC's default shape: `code` `-32603` or `-32003`, and
`data` with `code`, `httpStatus` and `path`. An `errorFormatter` that adds
fields is not reproduced.

Subscriptions (`httpSubscriptionLink`) are claimed and never read: only a JSON
response is, and an event stream is not one.

## Transforms

Code, with no model. Every value in the output was in the input.

- **`empty`** turns each list into `[]` and the envelope keys beside it into an
  empty page: a count to `0`, a next cursor to `null`, a has-more to `false`.
- **`one`** keeps the first item, with the same envelope.
- **`many`** repeats the items to fifty and raises a count to match. A repeated
  item gets a unique `id`, `_id`, `uuid`, `key` or `slug`.

Lists are looked for three objects deep, which covers `{ data: { items } }`,
and never inside an item. An envelope key changes only when its value already
has the right type, so a `total` that is a sentence is left alone.

**The limit is the schema.** Without one, nothing says a field may be null or
which field a list is keyed by. A list keyed by a field outside the five names
above repeats its keys under `many`. Shape sources (#169) lift both.

## The inventory

The last real 2xx answer of every call, per route pattern, in memory and in
`sessionStorage` so it survives the reload that applies a mock. A mocked answer
is never recorded. It is bounded to twenty routes, fifty calls a route, and
keeps a body over 64 KB of JSON in memory only. A full or blocked storage
leaves it working in memory.

## What is not done

- A recorded error body shape. REST `error` answers `{ message }`, and tRPC
  answers its default error shape.
- A delay for `loading`. It holds until the page reloads, and a held call in a
  batch holds the whole batch.
- A streamed procedure whose data is itself a promise or an async iterable.
  Such a stream is not read, so it is neither recorded nor reshaped.
