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
| The box's controller, framework-free            | `@maple-kit/mock/client`  |
| `useMock()`                                     | `@maple-kit/react/mock`   |
| `MapleMock`, the box and its banner             | `@maple-kit/ui/mock`      |

**A package, not a core subpath.** The interceptor is imported from a host's
entry before its first request, and a host that does not mock should not carry
it. A host that only mocks installs `@maple-kit/mock` and never loads the review
overlay.

**The recipe type is in core** because the comment fence carries it, and the
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
  route: "/projects",
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
- **`route` scopes it to one route pattern**, such as `/projects/:id`. A
  recipe kept for the tab would otherwise follow the reviewer to every page,
  and empty a list they never asked to see empty. Absent, it applies
  everywhere.
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

## The MSW transport

`mockHandlers(recipe)` from `@maple-kit/mock/msw`, or `/node`, is the same
resolver as MSW request handlers, for a host that already runs MSW: Storybook,
Vitest, Playwright. It is one `http.all("*")` handler that answers the named
calls and falls through for the rest, so it goes first and the host's own
handlers after it still answer everything else. A forwarded request goes out
through `fetch(bypass(request))`.

It is opt-in, and `msw` is an optional peer. In a browser it needs
`mockServiceWorker.js` on the host's origin, which is the host's CSP decision;
Maple's own path never needs a worker. It records the answers it reshapes but,
seeing no passthrough response, not the ones it lets through. The recipe comes
from the caller, since nobody types into a test.

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
writes them for calls that settle at once. When they do, every line of a partly
mocked stream but the mocked one matches the server's own stream exactly.

When one settles later, the server numbers its chunks in the order they settle,
which a plain answer does not say. The lines then differ in those numbers only,
and tRPC's client decodes every untouched call to the value the server sent.

What is lost is streaming itself: the page gets every call when the slowest has
answered. In the Next example, a call batched beside one that takes 1.5 s
arrives in about 10 ms unmocked and in about 1.5 s with a mock on the batch.

**A stream the page receives unmocked is read without holding it.** Recording
reads a copy of the response after the page has it, because the interceptor
would otherwise wait for the whole stream before handing it over. The copy is
read from the moment it arrives, and kept as far as it got when the page
aborts: tRPC's stream link aborts its request once its last call has answered,
before the stream ends, and a copy still waiting to be read errored with it.

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
response is, and an event stream is not one. The browser's own `EventSource`
never reaches the interceptor at all. A polyfill that reads the stream over
`fetch` or `XMLHttpRequest` does, and its events arrive as the server sends them.
The interceptor cancels its own copy of any body it did not read, since a
stream copied and left open cannot be closed by the page.

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

**Without a schema** nothing says a field may be null or which field a list is
keyed by, so a cursor is nulled on faith, and a list keyed by a field outside
the five names above repeats its keys under `many`.

## Shapes

A call's **shape** is one JSON Schema over what its data decodes to, and the
rung it came from: `supplied`, `router`, `validator`, `introspection` or
`sample`. `resolve` and `installMock` take a `shape(key)` lookup, asked only for
a call a body state reshapes. The type is `Shape` in `@maple-kit/core/mock`,
since the route writes it and the page reads it.

**The route serves shapes, per call, to a preview that asked.**
`RouteOptions.mock` is `{ preview, schemas }`: the host's preview build switch,
never `NODE_ENV`, since a preview is a production build; and OpenAPI documents,
each marked `rest` or `trpc`, highest rung first, or a function that reads them
once. `GET {base}/mock/schema?key=…` answers the shapes of up to a hundred keys
and leaves out any it has none for. It answers 404 unless `preview` is true,
and 401 to a reviewer the identity connector does not resolve, when there is
one. The documents are normalised on the first request, not at startup.

**The schema never reaches the page's bundle.** `installMock({ route })` reads
shapes from the route as calls need them, through the real `fetch`, one request
for every key asked in the same tick, and keeps every answer, a miss included,
for the page's life. Nothing under `route` is recorded or mocked. The Vite
example's `verify` checks that neither build carries its `openapi.json`.

**Router types, from `maple mock schema`.** `@maple-kit/cli` wraps
`@trpc/openapi`, which reads a router's TypeScript types statically, runs none
of its code, and needs no `.output()`:

```sh
maple mock schema server/router.ts --out=.maple/schema.json --superjson
```

The document it writes carries `x-maple-mock` (`codec: "trpc"`,
`source: "router"`, and `superjson` when asked), so `readSchemaDocument` hands
the route a document without being told what it is. **It is a preview build
artifact**: written by a step before the preview build and `next dev`, and
never committed, so it cannot fall behind the router it describes. The route
reads it on its first request, and without it has no shapes.

**`@trpc/openapi` is an alpha, and an optional peer.** It is loaded by dynamic
import inside that one command and nowhere else, pinned to one version, and a
missing install says which to add. Its programmatic API is used because the
alpha's own `bin` points at a file it does not ship. It asks for TypeScript
below 7, which holds the repository there while it is the rung this command
stands on. A subscription is not described; the generator does not yet do it.

**Normalising.** A `trpc` document has a path per procedure, `/project.list`,
and the shape is its 2xx answer's `result.data`. A `rest` document is keyed by
method and path, with `prefix` put in front, and a `{param}` segment matches any
one segment of a call's key. The first document that describes a key wins on
structure; the recorded or live answer still supplies the values. The box tags
each call with the rung its shape came from.

**A transform stays inside the schema.** A key is nulled only where it is
nullable (a type list with `null`, OpenAPI 3.0's `nullable`, a union with
`null`), dropped only where it is optional, and otherwise left as it was: an
empty page whose cursor is a required string keeps its cursor. `empty` and
`one` keep `minItems`, `many` stops at `maxItems`, and a repeated item takes
each enumerated field's next value, so `many` shows every status.

**A call nothing has answered is sampled from its schema.** When there is no
live answer and nothing recorded, the shape alone makes one, and the body
state reshapes it. The sample is deterministic, so a screenshot of it is the
same on every reload: `const`, then the first enum value, then an example or
a default, then the lower bound, one item, `"text"`, and fixed dates and
addresses by `format`. It ends a recursive schema eight levels down.

**It is not a dependency.** The sampler and the schema readers are about two
hundred lines in `src/schema/`, against openapi-sampler's whole surface, of
which this needs one function.

**A shape can say the call travels in superjson.** A sampled `date-time` is
then written as a `Date` in the envelope's `meta`, and tRPC's own client
decodes it to one. A failure on such a call is written in the envelope even
when nothing was ever recorded for it.

## The plan

A sentence becomes a recipe through `ClassifierConnector.plan`, an optional
method like `score` and `classify`: a classifier that can plan defines it, and
nothing else says so.

```ts
plan({ request, route, calls: [{ key, summary }] });
// → { state, distribution, confidence, calls: [{ key, concerned, p }] }
```

- **It picks, it writes nothing.** The answer is one of the six states or
  `none`, and a verdict per call. The transforms and the sampler do the rest.
- **`none` is an answer.** "Make the header blue" names no state a page's data
  can be in, and a plan that says so is more use than a guessed `empty`.
- **A distribution, not a verdict**, as in `docs/assist.md`: a sentence
  between two states really is between them, and `confidence` says how much.
- **`concerned` is `p` at or above one half**, derived rather than chosen, so
  the two cannot disagree. Every call in the request gets exactly one verdict,
  in the request's order.
- **A summary is what the call returns**, in schema names and descriptions
  where a schema exists. A planner is given the calls' keys and summaries and
  never their bodies.

`MOCK_PLAN_STATES`, `stateFromWeights` and `plannedCall` in
`@maple-kit/core/connectors` are for a planner with no probabilities of its
own. `runClassifierContract` checks a plan's shape for any connector that
defines one.

**The route plans, the page never reaches a model.**
`RouteOptions.mock.plan` is `{ classifier, cacheSize?, rate? }`, and
`POST {base}/mock/plan` takes `{ request, route, calls: [{ key, summary }] }`
and answers `{ plan }`. It is gated as `/mock/schema` is: 404 unless `preview`
is true, 404 when the classifier does not define `plan`, and 401 to a reviewer
the identity connector does not resolve. A blank sentence is answered
`{ plan: null }` without asking anyone. A sentence is at most 500 characters,
and the calls at most a hundred.

It shares `/assist`'s budget code, not its budget: a cache of 200 plans keyed
by the whole request, and 40 plans a minute per reviewer. A classifier failure
is logged and answered 502 with nothing of the cause, since a provider's error
can name its key.

**The shapes add to each summary.** Where the shape index describes a call,
the route describes its schema in a line: title or component name,
description, field names, and a list's item in brackets, two levels deep, a
local `$ref` followed. `rest:GET /api/reviews` reads `items [Review: id, repo,
branch, …], total, nextCursor`, and `trpc:user.me` reads `User: id, name,
since`. When the page's words are all in that line, only the line is sent, and
the other way about; otherwise both, with a dash between. Only names reach the
planner; a value never does.

**`maple mock plan` asks a deployed route**, not a model:

```sh
maple mock plan "no projects yet" --url=https://preview.example.com/api/maple \
  --route=/projects "--calls=trpc:project.list,trpc:user.me"
```

It prints the recipe the box's first chip would apply, `request` included, and
exits 1 with the reason when the gate says nothing: a sentence that names no
state, a plan under the floor, a route that plans nothing (404) or wants a
signed-in reviewer (401). Asking the route rather than a local classifier keeps
the model's key in the deployment, and gives CI the plan a reviewer would get,
schema names included. The gate is one function for both, `readPlan`, which is
why it lives in core rather than beside the box.

**The keyword planner** is `keywordClassifier().plan`, the floor the plan eval
measures against. State words pick the state (`no roasts`, `500`, `skeleton`,
`hundreds of`), and nothing matched is `none`. Words the sentence shares with
a call's key and summary pick the calls, a plural folded onto its singular and
a camel-cased key split into words. A sentence sharing no word with any call
is about the whole page, and concerns every call except a REST write and one
whose summary says `mutation`.

**The eval** is `evals/mock-plan.eval.test.ts`: 65 sentences against seven
pages' calls, scored on state accuracy and on the F1 of the calls a plan
concerns. The keyword planner scores 92.3% and 67.6% and runs on every CI
run; jev scores 94.4% and 76.7% over three samples, and must beat it. `evals/cases/mock-plan/README.md`
says where the cases came from, and why that flatters the word list.

It reads no grammar: "no errors" is `empty` and `error` at once, and two
states named equally come out torn between them, which is the honest answer
for a word list.

**jev plans in one request.** `jevClassifier().plan` sends the sentence, the
route and the calls as the `state`, and asks one `choice` over the seven plan
states, described by `MOCK_PLAN_STATE_DESCRIPTIONS`, and one `noul` per call:
does the sentence concern `calls[i]`? The probabilities are jev's own: the
state's distribution is the choice's, and each call's `p` is its `noul`. A
route with no calls asks only the state. The questions are keyed by index,
`call:0`, since a call key is any text.

A plan is a keystroke's judgement like a score, so there are no retries, and
`timeoutMs` (8 s by default) abandons one the endpoint never answers.

## The inventory

The last real 2xx answer of every call, per route pattern, in memory and in
`sessionStorage` so it survives the reload that applies a mock. A mocked answer
is never recorded. It is bounded to twenty routes, fifty calls a route, and
keeps a body over 64 KB of JSON in memory only. A full or blocked storage
leaves it working in memory.

## The box

`<MapleMock />` from `@maple-kit/ui/mock` is how a reviewer picks a state. It
lists the calls the page has made on this route and the six states beside each,
and Apply reloads into the choice. `m` opens and closes it and Escape closes it.
Inside `<Maple />` it is `Maple.Mock`, the same part, in the overlay's own
shadow root.

It is three layers, split as the overlay is:

- **`createMockClient()`** in `@maple-kit/mock/client` holds every rule: the
  draft, the filter, what is in force on this route, Apply, Turn off and the
  two copies. It touches no DOM until `start()`.
- **`useMock()`** in `@maple-kit/react/mock` is one subscription over it.
- **`MapleMock`** draws it, and touches no storage: persistence is the
  client's.

**The box finds the transport rather than importing it.** `installMock` leaves
its handle on the page, and the client reads it there. `<Maple />` therefore
carries the box's code on every page but the interceptor only where the host
installed it; with none installed the box draws nothing and does not bind `m`.
The Vite example's `verify` checks both halves: a production build with
`<Maple />` mounted carries no interceptor, and its mock-only page carries none
of the island, the composer or the marks.

**On its own it has its own shadow host** and adopts `MOCK_CSS`: the tokens,
the base rules and the box's, which `scripts/size.js` keeps under 7 KB with
everything it reaches. Its scheme is the opposite of the page's, as the
overlay's is by default.

**A banner is on while a mock is**, naming the first call and counting the
rest. It has Edit and Turn off and no dismiss: a reviewer who forgets a mock is
on reads mocked data as real.

**Where the route plans, the field is a sentence.** `installMock({ route })`
leaves a `plan` lookup on the handle beside `shape`, over the real `fetch`, and
the client asks it 500 ms after typing pauses, abandoning the request before.
It sends every call recorded on the route with a summary of the names in its
last answer, never a value. The list is not filtered while it plans.

What comes back passes the calm-UI gate, `readPlan` in `@maple-kit/core/mock`,
before anything is drawn:

| The plan                                  | The box                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| confidence below 0.4                      | nothing                                                 |
| `none`                                    | "That doesn't name a state this page's data can be in." |
| a state, the runner-up more than 0.15 off | one chip: `Empty · 3 calls`                             |
| the runner-up within 0.15                 | two chips, `Empty · 3 calls or Error · 3 calls`         |
| no call concerned                         | nothing                                                 |

A chip puts its calls in its state beside whatever the draft holds, and the
sentence goes into the recipe's `request`; Clear drops it. No number is shown,
and nothing moves while a plan is on its way. A failure is swallowed, as the
assist tier's is, and a 404 turns the field back into a filter for the page's
life: every word must match a key, as before a plan existed. `plan: false`
keeps it a filter.

A call the recipe names that this route never recorded is listed after the
rest, since a mocked answer is never recorded.

**Without a store, the box shares a mock by copying**: Copy link writes the
page's URL with the recipe in `?maple-mock=`, and Copy recipe writes the JSON.
`RouteOptions.store` is optional for such a host, and the comment endpoints
answer 404 without one.

## A comment remembers the mock

A comment written while a mock is on stores the recipe as `context.mock`: every
call it named and the state it was put in, the route pattern, and the sentence
behind it. The recipe, not the mocked bodies: `error`, `forbidden`, `loading`
and `empty` replay identically, while `one` and `many` reshape whatever the
server answers at replay time. Bodies would cost the fence space and could put
a page's real data in a public pull-request comment.

- **The page says what is in force.** `installMock` leaves `current()` on its
  handle, the recipe when it applies on the page's route, and core's
  `activeRecipe()` reads it by `MOCK_HANDLE_KEY` without importing the
  interceptor. `captureContext` records it with the viewport and the scheme.
- **The fence reads it through `parseRecipe`.** A recipe a build cannot read is
  dropped from the comment rather than failing the ledger; the comment stays.
- **It is the first detail shed** when the fence is over budget, before the
  quote's context: a replay is worth less than the words that locate a
  comment. Nothing is shed where no comment carries a recipe.
- **The ledger row says `mocked`** beside the viewport, so a person reading the
  pull request knows the page looked unlike the preview does now.
- **An agent gets it back from `get_comment_context`** as `mock.recipe`, with
  `mock.replay`, the comment's page with the recipe in `?maple-mock=`, and a
  `mocked: trpc:roast.list empty (…)` line in its conditions. The link's
  encoding, `encodeRecipe` and `linkRecipe`, is core's, beside the recipe.
- **`maple-action` reads the fence through core's `githubStore`**, keeps
  fields it does not know, and the fence stays version 1: the field is
  additive. It moves to the core that writes it in the same release.

## What is not done

- A recorded error body shape. REST `error` answers `{ message }`, and tRPC
  answers its default error shape.
- A delay for `loading`. It holds until the page reloads, and a held call in a
  batch holds the whole batch.
- A second box on the same page. Each claims `m`, and the first to hear it
  opens.
- A streamed procedure whose data is itself a promise or an async iterable.
  Such a stream is not read, so it is neither recorded nor reshaped.
