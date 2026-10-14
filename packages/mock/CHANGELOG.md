# @maple-kit/mock

## 0.23.0

### Minor Changes

- 074a57b: The flags list shows only the flags the page read. `@maple-kit/mock/launchdarkly`
  exports `launchDarklyUsage()`, a LaunchDarkly `flag-used` inspector (and
  `launchDarklyUsageHook()` for `hooks`), to pass as
  `options: { inspectors: [launchDarklyUsage()] }`. Each read is recorded as used
  on the current route; the full poll is still recorded, as known. Without an
  inspector the box lists every known flag, as before. `FlagRegistry.list()` is
  now `known()`, and gains `recordUsed()`, `used(route)` and `hasUsed()`.
- c1b07d1: `/mock/plan` no longer answers 400 for a page with many or odd flags. It drops
  a flag it cannot plan on its own, keeps the `MockPlanOptions.flags.limit`
  (default 100) most relevant to the sentence, and answers the plan with a new
  `warnings` field, which the box shows as a muted line under the input. Only a
  `flags` that is not a list is still a 400. `readPlanFlags` now returns
  `{ flags, warnings }`, and `PlanReading` gains `warnings`.
- a7aff9a: The mock box can reach what capture missed. The calls' and the flags' title
  rows each get a quiet "Search all", which turns the title into a focused field
  with "Cancel" and shows what it found over the page's list. It loads nothing
  until then, shows 20 results at a time, and a pick joins the draft, marked
  "added", and stays in the list after Cancel. Escape closes only the search. The flag search reads the known
  set in memory; the API search reads the tab's own calls first (the new
  `Inventory.all()`), then the route's new `GET {base}/mock/calls?q=&cursor=`,
  which lists the calls `MockRouteOptions.schemas` describes. It is gated as
  `/mock/schema` is, and rate-limited per reviewer on the plan's rate. `ShapeIndex`
  gains `calls`, `@maple-kit/core/mock` exports `CallEntry`, and `MockHandle` gains
  `calls`. `MockClient` gains `setSearch`, `searchCalls` and `searchFlags`. The
  box's size budget rises from 4.1 to 4.6 KB; the search itself is a lazy chunk
  with its own 2 KB budget.
- a68fdf9: Flags the server read show in the mock box. `@maple-kit/core/flags` exports
  `recordFlagUse(key)` and `withFlagUse(handler)`, which set `x-maple-flags` on the
  response (comma-separated, URL-encoded keys, 4 KB cap) while the Maple route has
  `mock.preview` on, and collect nothing otherwise. `@maple-kit/core/launchdarkly`
  has `launchDarklyFlagUse()`, a Node server SDK `afterEvaluation` hook.
  `@maple-kit/core/mock` exports the header's name and codec. The interceptor
  records the header's keys as used with source "server", and the box tags them
  "server" because a mocked value applies after a reload.

### Patch Changes

- Updated dependencies [c1b07d1]
- Updated dependencies [a7aff9a]
- Updated dependencies [a68fdf9]
  - @maple-kit/core@0.23.0

## 0.22.0

### Minor Changes

- 9f874c1: Breaking: inside `<Maple />`, `m` opens the mock box only while Maple is open, meaning the island card is up or a pick is armed. With the island collapsed it reaches the page untouched; tap the comment modifier, then press `m`. Opening the box while a pick is armed cancels the pick. The island header gains a Mock button, drawn only where the mock transport is installed, that opens and closes the box. `<MapleMock />` without `<Maple />` is unchanged. `createMockClient` takes a new `shortcutWhen` option.

  Breaking: the island's bottom "New: Element | Text | Region" row is gone, and `Maple.NewComment` and `Maple.PickButton` with it; `Maple.CommentButton` is the new part. A comment button in the header, left of the Mock button, replaces it: it arms the kind armed last (what a tap of the comment modifier arms), and pressed again while armed it moves to the next kind. The picker's bar still names the gesture and switches between the three kinds. `MapleClient` gains `armNext()`, the same call as that tap.

### Patch Changes

- 925d52e: Escape no longer reaches past Maple. It closes Maple's topmost layer (a pick, then the composer, settings, the island) only when focus is inside Maple or a pick is armed, and then it is consumed, so a host `<dialog>` is not closed by the same press and one press closes one layer. Escape while Maple is idle or during IME composition is left alone. Clicking any part of the island now moves focus into it, so Escape works afterwards. Tapping Shift with the comment modifier (Shift+Cmd on a Mac, Shift+Alt elsewhere) closes Maple from anywhere and keeps drafts.

  Breaking: `watchEscape`'s `onEscape` now receives the event and returns whether it closed something, and takes an optional `takesAll`; `watchPickKeys` and `PickKeyOptions` are removed from `@maple-kit/core/overlay` (the picker uses `watchEscape`); `TapNotice` gains `close`; `TapState` gains `chord`, and `tapStep` reports `close`.

- fc2da1a: The `m` shortcut no longer opens the mock box while you type. `opensMock` and `isEditable` now read the whole event path: `role=textbox`, `combobox` and `searchbox` elements, `contenteditable` ancestors and editors inside open shadow roots count as typing. A held `m`, an IME composition and keyCode 229 no longer open or toggle the box. The comment tap's text-field check uses the same path.
- Updated dependencies [b47e689]
- Updated dependencies [3d10af4]
- Updated dependencies [217ebcf]
- Updated dependencies [925d52e]
- Updated dependencies [fc2da1a]
- Updated dependencies [9f874c1]
- Updated dependencies [7c1e8c9]
- Updated dependencies [e9782ec]
- Updated dependencies [4565d27]
- Updated dependencies [ee35942]
- Updated dependencies [e3a306d]
- Updated dependencies [5900e08]
- Updated dependencies [c9d78ea]
- Updated dependencies [8f0bf16]
  - @maple-kit/core@0.22.0

## 0.21.1

### Patch Changes

- Updated dependencies [cb5257e]
- Updated dependencies [7f19ff2]
  - @maple-kit/core@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [957e8e7]
- Updated dependencies [bcc9ceb]
  - @maple-kit/core@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [6649e59]
- Updated dependencies [c6416c8]
  - @maple-kit/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [0a71dab]
- Updated dependencies [b62f2a0]
- Updated dependencies [83bffd2]
- Updated dependencies [0a71dab]
- Updated dependencies [0a71dab]
- Updated dependencies [6a49a8c]
- Updated dependencies [b3a3f19]
- Updated dependencies [c689f72]
- Updated dependencies [0a71dab]
- Updated dependencies [b3a3f19]
- Updated dependencies [a2a3713]
- Updated dependencies [817ab18]
- Updated dependencies [aab18b6]
- Updated dependencies [a2a3713]
- Updated dependencies [1c7e69a]
  - @maple-kit/core@0.19.0

## 0.18.0

### Patch Changes

- @maple-kit/core@0.18.0

## 0.17.1

### Patch Changes

- d7a18bb: The npm page of every package now links https://maple-kit.org as its homepage. The repository link still opens the package's own folder.
- Updated dependencies [d7a18bb]
  - @maple-kit/core@0.17.1

## 0.17.0

### Patch Changes

- @maple-kit/core@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [191b4ab]
- Updated dependencies [94880d9]
- Updated dependencies [6e998d1]
  - @maple-kit/core@0.16.0

## 0.15.0

### Minor Changes

- 1aac368: A plan request no longer grows with the page. `routePlan` gzips the body (`Content-Encoding: gzip`) where the browser has `CompressionStream`, and sends the recorded calls in consecutive batches of at most about 6 KB on the wire, then merges the readings, so no request approaches the 8 KB a managed web application firewall rule allows. `POST /mock/plan` inflates a gzipped body (up to 512 KB inflated) and still reads a plain one; any other `Content-Encoding` answers 415. A sentence on a busy page now spends one plan of the per-session rate limit for each batch.
- b8e0ad8: An app that renders the reviewer's roles on the server can now use a recipe's `as`. `RouteOptions.mock.identity` takes a `ServerIdentity` (`read(request)`, `roles`, optional `permissions` and `requires`) in place of a `CallIdentity`, and `/mock/identity` serves the rules with `server.current`, who `read` says the reviewer really is (`current: null` when nobody is signed in). `displayedIdentity` in `@maple-kit/mock/server` applies the recipe's `as` to that identity in a preview, for display only; never authorise with it. The client enforces `requires` with the recipe's role and no identity call, and the box says the role control reloads the page and reloads on a switch.

  Breaking: `IdentitySource` is now `CallIdentity | ServerIdentity`, and `IdentityRules.call` is optional, absent when the server renders the identity. `IdentityRules.role` and `permissions` have an optional `path`. `MockSchemas.identity` takes the request.

### Patch Changes

- 1aac368: A mock sentence that could not be planned is no longer silent. The box says it did not read the sentence, tells a refusal (401, 403) from a failure worth retrying, and leaves the calls to set by hand; the failure and its status go to the logger passed to `installMock`. `routePlan` now throws `PlanFailedError`, carrying the status, instead of a plain `Error`, and `MockClientState` gains `planFailure`.
- Updated dependencies [797fc01]
- Updated dependencies [ba6c9c4]
- Updated dependencies [ad204b9]
- Updated dependencies [2a29886]
- Updated dependencies [1aac368]
- Updated dependencies [b8e0ad8]
- Updated dependencies [3ca2d5f]
- Updated dependencies [92158b6]
- Updated dependencies [3ca2d5f]
- Updated dependencies [3ca2d5f]
  - @maple-kit/core@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [48ae76a]
- Updated dependencies [d1554a9]
  - @maple-kit/core@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [d1923ff]
  - @maple-kit/core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [34cd66d]
- Updated dependencies [a5e0af6]
  - @maple-kit/core@0.13.0

## 0.12.1

### Patch Changes

- @maple-kit/core@0.12.1

## 0.12.0

### Patch Changes

- @maple-kit/core@0.12.0

## 0.11.0

### Patch Changes

- 6ac8d9b: Apply and reload, and Turn off, in the mock box and its banner reload the page
  without the browser's "Leave site?" dialog, even while a comment draft is
  open. The reviewer chose to reload, and the draft is saved first as it always
  was. `navigateOnPurpose(view, url)` joins `@maple-kit/core/client` for any
  surface that navigates on the reviewer's say-so; Discard in the leave prompt
  uses it too.
- Updated dependencies [b7a0f25]
- Updated dependencies [2bf7ed3]
- Updated dependencies [b7a0f25]
- Updated dependencies [6ac8d9b]
- Updated dependencies [b7a0f25]
  - @maple-kit/core@0.11.0

## 0.10.0

### Minor Changes

- 1cb2f6f: `encodeRecipe`, `decodeRecipe`, `linkRecipe` and `RECIPE_PARAM` move to
  `@maple-kit/core/mock`, beside the recipe whose wire format they are, so a
  server replaying a comment's mock builds the same link the page reads.

  **Breaking:** `@maple-kit/mock` no longer exports them; import them from
  `@maple-kit/core/mock`.

- d9ff194: A recipe's `as` is applied. With identity rules, read from the route's
  `/mock/identity` or passed as `installMock({ identity })`, the identity call's
  answer carries the recipe's role and permissions, and a call the shown
  identity may not make answers 403 without being sent. Writes are not blocked:
  each one that reaches the server is logged as a warning and listed on
  `MockHandle.writes`. `resolve` takes `identity` and `onWrite`; `impose`,
  `meetsNeed`, `realIdentity` and `routeIdentity` are exported.
- a02a975: Three body states join `empty`, `one` and `many`: `long` (every text as long
  as the page could receive, from its own characters, and every number at its
  widest), `sparse` (everything that may be missing is missing) and `mixed` (a
  list covering every enum value, both booleans, null and set, absent and
  present, short and long text). `MOCK_STATES` lists them last, the recipe stays
  version 2, and the mock box shows a button for each.

  **Breaking:** a 0.9.0 reader refuses a recipe naming one of them, as it refuses
  any state it does not know. They ship in the same release as the version-2
  recipe, which no released reader has seen either.

  `MOCK_PLAN_STATES` is now its own list rather than `MOCK_STATES` plus `none`,
  and `MockPlanState` is its element type: the plan does not pick the three new
  states until its evals measure them.

- 50f80c9: The mock box sets flags and who the page is shown as. `createMockClient()`
  lists the flags the page evaluated (`state.flags`), reads the host's identity
  rules (`state.identity`), drafts both (`draftFlags`, `draftAs`, with
  `setFlag`, `setRole` and `setPermission`), counts the writes that reached the
  server under `as` (`state.writes`), and applies a recipe that names flags or
  `as` with no call. `MockHandle.identity()` reads the rules once, from the
  options or the route.

  `MapleMock` draws them in a panel loaded as a separate chunk, only on a page
  with identity rules or evaluated flags, and its banner says "Showing as …. The
  server still acts as you."

  **Breaking:** `MockClientState` has five new fields, so a hand-built state
  must set them, and `clear()` also empties the draft's flags and identity.

- 7ace7e4: The mock box reads a sentence where Maple's route plans one. `installMock({
route })` leaves a `plan` lookup on the handle (`routePlan`, over the real
  `fetch`), and `createMockClient()` asks it once typing pauses, gates the answer
  the calm-UI way (core's `readPlan`: nothing under 0.4, two suggestions within
  0.15, `unnamed` for `none`) and exposes `planning`, `suggestions`, `unnamed` and
  `request` on its state. `suggest(index)` puts a suggestion's calls in its
  state, and the sentence goes into the recipe's `request`. A route with no
  planner turns the field back into a filter; `plan: false` keeps it one.
- 5fc5eb1: `createMockClient()`, at the new `@maple-kit/mock/client` entry and the root,
  is the mock box's controller without a framework: the calls this route has
  recorded, a draft of states, Apply and Turn off, and Copy link and Copy recipe
  for a page with no store. It finds the transport `installMock` put in the page
  rather than importing the interceptor, so a page that shows the box without
  mocking loads none of it.

  **Breaking:** `Inventory` has a `subscribe(listener)` method, so an object
  written to satisfy that interface needs one.

- 4493ac7: `MockHandle.current()` answers the recipe in force on the page's current route,
  which a comment written under the mock records. It is optional on the
  interface, so a handle a test builds need not define it.
- 13fe029: `installMock({ flags })` takes flag sources: a vendor's flag request, read for
  `seenFlags()` and answered with the recipe's flags, and its stream, held
  through a wrapped `EventSource`. `launchDarklyFlags({ baseUri?, streamUri? })`
  from `@maple-kit/mock/launchdarkly` is LaunchDarkly's browser SDK: its
  `/sdk/evalx/` poll, and its stream's `put`, `patch` and `delete`. `FlagSource`,
  `holdStreams` and `flagType` are exported for another vendor's source.
- a93dc26: `withMockFlags(provider)` from `@maple-kit/mock/openfeature` answers the flags
  a recipe names and delegates the rest, for a web or a server OpenFeature
  provider, and holds back the provider's change events for an answered flag.
  Every evaluation is recorded with its real value in `seenFlags()`.
  `@maple-kit/mock/testing` has `runFlagProviderContract` and
  `memoryFlagProvider`; `vitest` is an optional peer, needed only there.
- 8707fda: The mock box puts the planner's reading straight into the draft instead of
  offering it as a chip. Each new reading is applied over what the draft held
  before the sentence, and emptying the field, or a sentence that names no
  state, puts that back; a change by hand keeps what is there. While a plan is on
  its way a sweep runs along the field's lower edge, and stands still under
  reduced motion.

  Breaking: `MockClient.suggest` is gone, since nothing is left to take. The
  reading is still on `MockClientState.suggestions`.

- decec98: A mock plan sets flags and who the page is shown as. `MockPlanRequest` takes
  the page's `flags` (`{ key, type, variants? }`) and the host's `roles`, and
  `MockPlan` answers one `PlannedFlag` per flag and a `PlannedRole`. The route
  adds the roles from its own identity rules, drops a flag with no values, and
  keeps an answer to what was listed. `readPlan` carries named flags and a role
  on each suggestion, or as a suggestion of their own. The keyword planner reads
  them without ever taking a key from the sentence, `jevClassifier` asks for them
  in a second request so the state and calls are judged as before, the box sends
  the flags it saw and applies a layered chip, and `maple mock plan` prints them.
  `plannedFlag` and `flagValues` are exported from `@maple-kit/core/connectors`,
  and `memoryClassifier` takes `planFlags` and `planRole`.

  **Breaking:** `MockSuggestion.state` is optional, since a chip may name only a
  flag or a role, and `createMockPlanner` takes the route's mock schemas rather
  than a shapes lookup.

- 1b2b4ae: `MockClientState.thinking` is true while the route reads the box's sentence,
  and not while it is still being typed. Two motion tokens join the contract for
  a wait like that one: `--mk-dur-shimmer` and `--mk-shimmer-sweep`.
- d57cb19: The mock box's "Shown as" and "Flags" rows start on what the page really sees:
  the reviewer's role and permissions, read from the identity call's last real
  answer, and each flag's evaluated value. The real option carries a green dot,
  and choosing it again drops the override. `MockClientState.realAs` (a new
  `RealAs` type) holds the real role and permissions.
- c597ef7: A server can read the mock recipe. While a recipe has `flags` or `as`, a
  preview's page keeps them in a `maple-mock` cookie (set by the interceptor on
  install and by the box on Apply, cleared on Turn off), and
  `requestRecipe(request)` from the new `@maple-kit/mock/server` subpath reads it,
  or a `?maple-mock=` link in the request's own URL. The cookie never carries
  `calls`, and is not written when it would exceed 4096 bytes; the interceptor
  warns instead.

  Core adds `RECIPE_COOKIE`, `RECIPE_COOKIE_LIMIT`, `recipeCookie` and
  `readRecipeCookie` to `@maple-kit/core/mock`.

  **Breaking:** `MockView.location` must also carry `protocol`, so the cookie is
  `Secure` over HTTPS. `window` already does.

- 4acc6db: `installMock({ route: "/api/maple" })` reads each call's shape from Maple's
  route as it is needed, batched and cached, and never records or mocks anything
  under that path. `routeShapes` is the same lookup on its own. `MockHandle.shape`
  and a row's `source` let the box say where each shape came from. `Shape`,
  `JsonSchema` and `SHAPE_SOURCES` now come from `@maple-kit/core/mock`.
- c62cad0: Shapes: `resolve` and `installMock` take a `shape(key)` lookup, one JSON Schema
  per call. A transform then stays inside it (a key is nulled only where it is
  nullable and dropped only where it is optional, `minItems` and `maxItems` hold,
  and `many` cycles enum values), and a call with no live answer and nothing
  recorded is sampled from the schema alone with `sampleSchema`, deterministic
  and superjson-aware. `reshape` and `reshapeTyped` take the schema as an
  optional last argument.

### Patch Changes

- 7ff6fd9: A `loading` call held on Node, as by the `@maple-kit/mock/node` handlers, now
  settles when its request is abandoned after a garbage collection. Node links a
  `Request`'s signal to the caller's only weakly, so a held request nothing else
  referenced could be collected and never hear the abort.
- 59e5de3: `launchDarklyFlags()` with no `baseUri` claims the 3.x browser SDK's default
  host, `https://app.launchdarkly.com`, as well as 4.x's
  `https://clientsdk.launchdarkly.com`. A page on `launchdarkly-react-client-sdk`
  3.x had its flags neither read nor answered.
- 111360f: `long` no longer glues a value's letters into one unbroken run, which read on
  a page as Maple breaking it ("AdaAdaAda"). Words repeat with a space between;
  only a value that is already unbroken, such as a branch, a slug, an address or
  a URL, grows as one, from its own words.
- a939399: `withMockFlags`' `recipe` option names `requestRecipe` from
  `@maple-kit/mock/server` as the server's source, where it named `./node`.
- 2d13012: A streamed tRPC batch the page let through is recorded again. tRPC's stream
  link aborts its request once the last call has answered, which errored the
  interceptor's copy of the body before it was read, so the inventory stayed
  empty on every page using `httpBatchStreamLink`. The copy is now read from the
  moment it arrives, and what was read before the abort is kept.
- Updated dependencies [0606059]
- Updated dependencies [4493ac7]
- Updated dependencies [2271457]
- Updated dependencies [5d832df]
- Updated dependencies [4b8e7c9]
- Updated dependencies [1cb2f6f]
- Updated dependencies [a02a975]
- Updated dependencies [b66c3c0]
- Updated dependencies [eccf75c]
- Updated dependencies [decec98]
- Updated dependencies [c597ef7]
- Updated dependencies [2abe3f0]
- Updated dependencies [78f0692]
- Updated dependencies [264e019]
- Updated dependencies [9591b2d]
- Updated dependencies [4acc6db]
- Updated dependencies [2abe3f0]
- Updated dependencies [4ae5179]
  - @maple-kit/core@0.10.0

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
