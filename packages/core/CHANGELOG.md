# @maple-kit/core

## 0.1.2

### Patch Changes

- f2e7545: Say plainly why Maple needs two GitHub Apps rather than one.

  `docs/github-auth.md` explained the consequence and buried the reason. It now
  leads with the mechanism — a user-to-server token is bounded by the App's
  permissions, so every permission the App carries is one every reviewer's token
  carries — and states the blast radius: one App for both jobs turns a phished
  reviewer from "comments they could write anyway" into a read of every repository
  the App is installed on, silently.

  Also says the thing that was only implied: a comment App must not carry the
  gate's permissions before the gate exists, because that is all of the exposure
  and none of the benefit.

- 338859c: Correct the comment App's permissions: `Issues` is not one of them.

  `docs/github-auth.md` asked for `Issues: Read and write` on the reasoning that a
  pull-request conversation comment is an issue comment, which is true, and that
  the write therefore needs the `Issues` permission, which is not.

  GitHub lists all four endpoints `githubStore` uses — list, create, read and
  update a comment — under both `Issues` and `Pull requests`, and Maple only ever
  comments on a pull request. So `Pull requests: Read and write` plus `Metadata`
  is the entire set, and an App carrying `Issues` hands every reviewer's token
  write access to every issue in the repository for no benefit.

## 0.1.1

### Patch Changes

- 69fb978: Publish from CI with no npm token at all.

  `release.yml` authenticates to npm by exchanging the job's OIDC token instead of
  carrying a secret. `id-token: write`, the `registry-url` step and
  `NPM_CONFIG_PROVENANCE` all stay — provenance and trusted publishing use the
  same exchange — and `NODE_AUTH_TOKEN` is gone.

  The token this replaces existed for one reason: npm registers a trusted
  publisher only from an _existing_ package's settings page, so the first release
  could not use one. This version is the proof that the second one can.

## 0.1.0

### Minor Changes

- bbb7433: Sign a reviewer in to GitHub from a preview, with no GitHub secret in it.

  Device Flow now runs through the route: `POST /auth/github` starts a link,
  `PATCH /auth/github` makes one exchange attempt, `DELETE /auth/github` forgets
  the token, and `GET /me` reports whether this reviewer has linked and under
  which login. `RouteOptions.githubAuth` turns them on; without it they answer 404.

  The reason this shape and not the redirect flow: **Device Flow's exchange needs
  no client secret.** A preview environment holds the App's public client id and
  nothing else. Each reviewer gets their own user-to-server token, so a
  pull-request comment is authored by them rather than by a shared bot, and one
  person's token is never another's.

  The token and the device code are both credentials, and neither reaches the
  browser. Both travel in `HttpOnly; Secure; SameSite=Lax` cookies scoped to the
  route's own path. `readGitHubSession` from `@maple-kit/core/auth` is what a
  store resolver calls to turn the cookie into a token. An optional `key`
  encrypts the cookie with AES-GCM; `docs/github-auth.md` is honest about how
  narrow that is and why `HttpOnly` is the control that carries the weight.

  `DeviceFlow` gains `exchange(code)` — one attempt, for a caller doing its own
  waiting. `poll` is now written over it. A person takes minutes to type a code,
  and a request held open that long is a request a proxy will close.

- 8038da7: Add the GitHub pull-request store connector, Maple's default store.

  `githubStore({ owner, repo, token })` keeps one issue comment per Maple comment,
  each carrying the human table above its ` ```maple ` fence, so GitHub's own
  threading, notifications and permissions do the work. A comment id encodes the
  pull request, so `setStatus` needs no index and works in a process that never
  listed.

  It passes the shared store contract. Every call it makes has an msw handler,
  including a rate-limit error and a non-JSON gateway error.

- 1cb6bcc: Add the overlay's host and its three ways of picking a target.

  `createOverlayHost()` mounts a shadow root that takes styles only as adopted
  stylesheets and pins itself with `setProperty`, which is what keeps
  `docs/overlay-csp.md`'s claim true. It marks itself `data-maple-overlay`, so
  the anchor cascade and the pickers all look past it.

  `startElementPicking`, `startRegionPicking` and `selectedText` cover the three
  kinds of comment. Each ignores the overlay's own UI, and element picking
  swallows the click so picking cannot submit the page's form.

- f99659d: Add screenshots at `@maple-kit/core/screenshot`.

  `imageFrom` and `imageIn` take an image a reviewer pasted, dropped or chose —
  the first-class path, not a fallback. `previewOf` gives a `blob:` URL for
  showing it before upload, which is the one CSP directive Maple asks for.

  `captureElement` renders an element and two ancestors through snapdom, an
  optional peer imported only when a capture is asked for. It throws
  `CaptureUnavailableError` naming the paste path rather than returning a blank
  image, because a blank screenshot on a comment looks like evidence.

- 8dd0e2e: Add the tagger's two emitters: `@maple-kit/core/vite` and
  `@maple-kit/core/loader`.

  The Vite plugin is one entry in `vite.config.ts`. The loader is how Next reaches
  the same transform, configured as a Turbopack rule. Both run the same Babel
  plugin, so they cannot drift.

  `examples/vite-app` and `examples/next-app` are real applications that assert on
  their own build output, including that `reactRemoveProperties` strips
  `data-maple-` from the Next **server** bundle and not only the client one.

- 038f2c7: `githubStore` finds the pull request, instead of being told the branch.

  The branch name is the easy case and not the common one. A preview hostname has
  to be a DNS label, so what it carries is usually a ticket or a shortened
  branch — and the branch is then the one thing the browser does not know, while
  the build knows its commit for certain. Every integration that hit this wrote
  the same two GitHub calls and the same cache outside Maple, which is the shape
  of a missing option.

  `GitHubStoreOptions.pull` is that option, tried in order:

  1. `pull.commit` — `GET /commits/{sha}/pulls`, which names the pull request
     outright rather than inferring it.
  2. The identifier as the head branch's own name, the plain case.
  3. `pull.matches(head, identifier)` — asked per open pull request, newest
     first, so an application supplies its own rule and not a GitHub client.

  `GitHubStoreOptions.cache` takes a `createPullCache()`. It is a parameter
  rather than a closure because a per-reviewer credential means a store built
  **per request**, so a cache inside one would be thrown away with it — which is
  why `list` and `append` each paid a lookup on every call. Only a hit is kept: a
  branch is pushed, the preview builds, and the pull request is opened after
  that, so a miss has to be re-asked.

- cf9bd03: A merge gate has a shape: `decideGate`, and a fifth connector kind.

  `@maple-kit/core/gate` decides whether a commit is clear to merge from the
  comments alone, and `GateConnector` publishes that decision to a forge. They
  are apart on purpose: `maple/visual-review` is a GitHub check run, GitLab uses
  external status checks and Bitbucket's enforcement is Premium-only, so one
  decision has three publications. The split keeps the check-run API out of core.

  A `GateVerdict` carries a **reason**, not only a conclusion, because the two
  neutrals need different answers from a person: a store that could not be read
  is not a store that cannot record status.

  Everything but `resolved` blocks — including `orphaned`, so that a layout change
  that unpins a comment cannot silently clear the gate. `blockOn` narrows it.

  `runGateContract` and `memoryGate` are in `@maple-kit/core/testing`. The
  contract asserts the property that sank Chromatic: a gate that blocks must be
  able to stop blocking, on the same commit, with no new push.

  `ConnectorKind` gains `"gate"`, so `maple connectors` prints it. `docs/gate.md`
  is the design, including what the GitHub gate will have to do.

- 991363a: Add the overlay's context capture and draft storage.

  `captureContext()` records the shape of the page a comment was written
  against — window and content width, DPR, scheme, the named breakpoint,
  locale, time zone, reduced-motion, and any layout region that was open with
  its width. `formatContext()` turns that into the badge a reviewer reads.

  `createDraftStore({ branch })` keeps unsent comments per branch in
  `localStorage`, and keeps working in memory when a browser refuses site data
  rather than taking the overlay down with it.

- 74adfe4: Add `sourceFor` to `@maple-kit/core/anchor`: where the thing a comment is on is
  written, as `path/to/file.tsx:line:col`.

  It is `labelFor`'s sibling and reads the same way — the page first, from the
  nearest ancestor carrying `data-maple-src`, then what the anchor recorded. The
  page wins because the anchor records where the element was when the comment was
  written, and a redeploy since has moved the line. `LabelSource.anchor` widens
  from `Pick<Anchor, "component">` to include `source`.

- 8c26051: `CommentContext` keeps the content width and the regions that were open, and
  `toCommentContext` converts a captured `PageContext` into one.

  The badge's headline claim — `1440 window · 1020 content · Copilot open` —
  rendered in the composer and was gone the moment the comment was stored,
  because nothing converted between the two shapes. `RegionContext` moves into
  `types.ts` so a server-side consumer can read a stored comment without
  importing from `/overlay`, and `formatContext` now takes either shape so the
  badge renders identically in the composer and in the inventory.

  `contentWidth` is required, and the exporter never sheds it. Regions are the
  new second reduction, after `quote-context`.

- 473898c: Add the markdown exporter at `@maple-kit/core/export`.

  `exportMarkdown` builds the pull-request body: a table a person reads above a
  visible ` ```maple ` JSON fence an agent reads. The fence is never an HTML
  comment, because the action that hands a pull-request body to an agent strips
  `<!-- -->` before the model sees it.

  `parseFence` reads one back, preserving fields it does not know and refusing a
  version it cannot read. Over the 8 KB budget the exporter sheds detail in a
  fixed order and never drops a comment; if even the smallest form is too big it
  reports that rather than truncating.

- 3b2edc2: Keep the commit that resolved a comment, instead of returning it and losing it.

  `Comment.resolution` is a `CommentResolution` — the `sha` an agent says
  addressed the comment, an optional `note`, and the `at` it was written. It rides
  through the export fence like every other field, so the default GitHub store
  persists it without a line of storage code.

  `setStatus` takes it as an optional third argument and stays capability-by-
  presence: a store that cannot keep a resolution still records the status.
  `resolve_comment` now passes the `sha` and `note` it has always accepted, and
  the route reads a resolution off the `PATCH` body but stamps `at` itself — a
  client that can date its own resolution can backdate one.

  A comment cannot arrive already resolved, so the route drops a `resolution`
  posted with a new comment, and the shared store contract asserts a resolution
  survives a re-read.

- 40f2ee4: Screenshots have somewhere to go, and every way of not having one says so.

  Maple captured the page at pick time and then dropped it. `MediaConnector` was
  a contract with no route behind it, and `Maple.Attachments` only attached an
  image when the host application passed it an `upload` function — so a default
  installation previewed a thumbnail and lost it on send. The three ways not to
  end up with a screenshot all rendered as the same grey line asking for a paste,
  which reads as a tool that never took one.

  **The route carries media now.** `RouteOptions.media` takes a `MediaConnector`
  or a per-request `MediaResolver`, the same shape `store` has, and serves:

  - `POST {base}/media` — the bytes in, the `MediaRef` back.
  - `GET {base}/media/{key}?type=…` — a redirect to the connector's own URL,
    because a signed URL is the point of `getUrl` and proxying every screenshot
    would put them on the application's budget. A `data:` URL is served instead
    of redirected to, since a browser refuses to follow one.
  - `GET /me` now reports `media`, so the overlay knows before it offers anything.

  **Breaking.** `Maple.Attachments`'s `upload` and `resolve` are overrides rather
  than requirements: without them the strip posts to the route and reads back
  from it. `MapleClient` gains `uploadMedia` and `mediaUrl`, so a Svelte binding
  gets the same default. `ShotStore` holds a `Shot` — an image **or** a reason it
  failed — rather than a `PastedImage`, and `ComposerScopeValue.offer` takes the
  `MediaSource`, so a stored comment can say whether Maple took the picture or
  the author did.

  **A screenshot used to arrive corrupt through the Node adapter.**
  `toNodeMiddleware` read the request body with `setEncoding("utf8")` and wrote
  the response with `response.end(await result.text())`. Both round-trip bytes
  through a UTF-8 string, so an uploaded PNG came back as an image no decoder
  opens — and nothing on either side said so. It carries bytes now.

  New: `memoryMedia()` in `@maple-kit/core/testing`, so the examples and the
  suites exercise capture → upload → reference → image without a bucket. The Vite
  example uses it, and its seeded screenshots go in through the same `putBlob` a
  capture uses rather than through a resolver written for the demo.

  `@zumer/snapdom` stays an optional peer — 550 KB for a transform a server-only
  use of the route never reaches, behind a dynamic import — but skipping it is no
  longer silent. `docs/screenshots.md` is the whole path and that reasoning.

- 22f0fc5: Give a reviewer a stable colour slot.

  `CommentAuthor.colorSlot` is an integer from 0 to 9, into the ten OKLCH hues a
  mark is drawn in. Hue was a per-page assignment, so two reviewers commenting
  from two machines could be drawn as the same person; the route now derives the
  slot from a hash of the author's id instead, and the answer is the same in every
  process.

  It is assigned where the author is — from the identity connector, never from the
  request body. A client that can choose its own slot can choose someone else's. A
  guest still gets whatever the page has free, assigned in the browser.

- 7181bfd: Ask once before a client-side navigation takes an unsent comment away.

  The design document's third layer is "while dirty, prevent the default and ask
  once", and the confirm copy it specifies — "You have an unsent comment on the
  Yield card", Keep writing / Discard — has nowhere else to appear, because no
  current browser lets `beforeunload` carry custom text.

  `createMapleClient({ askToLeave })` supplies the ask. A capture-phase click on a
  same-origin anchor now prevents the default while a draft is dirty, saves, and
  hands the surface a question: the reason, the draft's id, the name `labelFor`
  resolves for what it sits on, and where the click was going. The answer may
  arrive later, so a rendered dialog is as usable as a native one. Discard throws
  the draft away and performs the navigation that was prevented; Keep writing does
  nothing at all, which is what leaves the composer the focus it had.

  Once per draft, literally: a reviewer who kept writing and then deliberately
  clicks another link is not asking to be interrogated again. Without
  `askToLeave` nothing changes — the guard saves and lets the click through — so
  the headless layer stays usable by a caller that has no interface. The other
  three layers are untouched: `beforeunload` still never asks, `pushState` and
  `popstate` still only save.

- 7212b52: Name an element the way a reviewer would, with `data-maple-label`.

  `labelFor` in `@maple-kit/core/anchor` reads the nearest `data-maple-label` at
  or above an element — an application writes it by hand, so one attribute on a
  card names everything inside it — and otherwise unpicks the component's own
  camel case into a noun phrase. `YieldCard` reads as "Yield card" and
  `APIKeyCard` as "API key card"; an acronym is left as it was written.

  It works from an anchor alone, so an unpinned comment still has a name in the
  inventory. When nothing names the element it returns nothing, because the
  surface saying "the Yield card" about the wrong card is worse than saying
  nothing.

  The tagger is unchanged: it never writes a label. Emitting one on every
  intrinsic element would only restate the fallback, and it would end the upward
  walk before a label the application wrote on the card above could be found.

- 02dadef: Carry the configuration in the link, and remember what the viewer chose.

  `@maple-kit/core/client` gains the preference model: `parseMapleQuery()` reads
  `?maple=off|on`, `?maple-pos=`, `?maple-detail=`, `?maple-comment=` and
  `?maple-new=` off a search string, `resolveConfig()` settles the order — query
  string, then the viewer's stored preference, then props, then the defaults —
  and `readPreferences()` / `writePreferences()` keep the two the viewer owns per
  origin, treating a storage that throws on access as no preference at all. An
  application setting `enabled: false` can never be overridden into being on;
  turning Maple off from a link always works.

  The controller now carries `detail`, `position`, `hidden` and `selected`, with
  `setDetail`, `setPosition`, `setHidden` and `select` beside them. Hidden is for
  the session and is not gone: a comment arriving, a pick being armed, a composer
  opening or a link selecting a comment all bring the island back, so no state
  change is discarded out of sight. `detail` is presentation only — the export
  fence carries every field either way.

  `formatContext()` takes that detail as a second argument: default detail reads
  the window's width, the scheme and what was covering the page; developer detail
  adds the layout width, the breakpoint, the device pixel ratio and the locale.
  `opensComposer()` takes the key, so `shortcut` is an application's to choose.

- 657204d: A screenshot on a pull request is a link a person can click.

  `GitHubStoreOptions.media` takes a `MediaConnector`. Given one, `githubStore`
  resolves a comment's first image attachment and passes it to `exportMarkdown`
  as the `screenshots` map, so the table finally gets its **Shot** column. Given
  none, behaviour is exactly what it was: the `MediaRef` sits in the fence and
  nothing human-readable points at it.

  The export already supported this; nothing called it. `exportMarkdown`'s
  `hostedOnly` still drops anything that is not `http(s)`, so a development
  connector serving data URLs produces no column rather than a dead one.

  A media connector that rejects costs the table its link and nothing else. The
  comment posts and the ref is kept: losing a reviewer's comment because a bucket
  was down is the worse failure of the two.

- aed6bc7: Reserve `Comment.parentId` for replies, which Maple does not ship.

  Maple has one body per comment: a comment is a request for a change and it is
  answered by a commit, not by a sentence. Nothing sets `parentId`, nothing reads
  it, and the composer offers no way to make one.

  It is on the wire type anyway so that changing that decision stays additive. The
  flat list is already a one-level grouping by `parentId` where every value is
  `undefined`, so adding replies later is a UI change plus a composer affordance
  rather than a schema migration.

  `docs/replies.md` records the decision and what revisiting it costs in the island
  and in the export. The exporter keeps one row per comment, preserves the caller's
  order and never infers order from `createdAt`, which is what leaves room for an
  indented row later.

- 16957ec: Add the build-time JSX tagger at `@maple-kit/core/tagger`.

  It writes `data-maple-src` (`path:line:column`, repository-relative and
  POSIX-separated) and `data-maple-name` onto intrinsic elements, so a comment
  left on a deployed preview names a file and a line rather than a CSS selector.
  React 19 removed the tree-side equivalent and a preview is a production build,
  so there is nothing to read at runtime.

  The entrypoint also exports the attribute names and the source-location format,
  because the anchor cascade and the overlay have to agree with what was written.

- 74adfe4: A region is the rectangle a reviewer drew, not the element under its middle.

  `CommentAnchor.region` records it as fractions of the smallest element that
  holds the whole of it, so a page that lays out wider moves the rectangle with
  the thing it was over. `containerFor` in `@maple-kit/core/overlay` finds that
  box; `regionOf` and `regionBox` in `@maple-kit/core/anchor` convert both ways.
  A region pick now carries that element on the `Pick`, and `targetFor` no longer
  returns nothing when a rectangle covered no element — `documentElement` is a box
  too, and a rectangle over the page's own background is still a rectangle.

  `kindOf(anchor)` moves to `@maple-kit/core/anchor` and is the one answer to
  which pick made a comment. The controller, the mark layer and the island each
  guessed at it separately, which is two chances to disagree. `PickKind` moves to
  the domain vocabulary with it, because the anchor reads it back off a stored
  comment and the client cannot also own the word.

  `MediaRef.source` says who attached an image: `capture` is Maple's own, taken at
  pick time without being asked, and a reader of a written comment had no other
  way to tell that from one the author chose.

- 2d5eb8d: Give a draft the shape a sent comment has: `Draft.attachments` so a pasted
  screenshot comes back with the draft it belongs to, and `Draft.context` as a
  `CommentContext` instead of a `PageContext`.

  **Breaking:** `Draft.context` changes type. Anything assigning the result of
  `captureContext()` straight onto a draft now converts it first with
  `toCommentContext()`. The payoff is one badge implementation across a draft and
  a stored comment rather than two that drift.

- fbe201b: `githubGate`: the check run that holds a merge open.

  `maple/visual-review`, published from a `GateVerdict`. Blocked is
  `status: in_progress` with no conclusion, never `conclusion: failure` — a
  required check passes only on `success`, `skipped` or `neutral`, so an open run
  blocks exactly as hard as a failure and, unlike a failure, can be exited with
  no new commit.

  A second publish updates the run in flight. Where the existing run is already
  completed, a new one is posted under the same name and SHA instead of the
  completed one being reopened.

  `read` gives back the whole verdict, because the counts ride in `external_id`
  rather than in the markdown summary a person reads. A run some other tool
  created under the same name reads back as `unreadable` with zero counts, which
  is the honest answer.

  `CHECK_NAME` is exported: it is the string a branch-protection ruleset
  requires, and changing it silently orphans the required check.

- f09d860: `withMaple` for Next, and a page that says when the tagger did not run.

  Tagging a Next build takes two settings that have to agree: a Turbopack rule
  that adds `data-maple-src` and `data-maple-name`, and `reactRemoveProperties`,
  which must not take them off again on the same build. Wired by hand they
  disagree **silently** — nothing throws, the page renders, and every comment
  anchors to "this page" with no component name and no file.

  Both ways it goes wrong have now happened in a real integration:

  1. `reactRemoveProperties` left on for the preview build, so the rule tags and
     the pass immediately untags.
  2. `"src/**/*.tsx"` as the rule key. Turbopack matches a key containing a
     separator against the whole path, so it never matches — and a rule that
     matches nothing is not an error.

  `@maple-kit/core/next` exports `withMaple(config, { preview })`: one flag drives
  the rule, the stripping and a webpack hook, so `next dev --webpack` is not a
  quiet downgrade either. It throws when the config already sets
  `compiler.reactRemoveProperties`, because two owners for the field that decides
  whether the tagger's work survives is the bug it exists to prevent; extra
  patterns go through `removeProperties`.

  A build still cannot report this — from the build's side nothing happened — so
  the page is asked instead. `pageIsTagged` in `@maple-kit/core/overlay` looks for
  one `data-maple-src`; the controller asks on start and on every pick and keeps
  the answer as `ClientState.tagged`, logging a warning the first time it turns
  false. The island's settings panel carries a row saying so and naming
  `withMaple`, because that panel is where someone wondering why everything says
  "this page" will already be looking.

- 25c47f5: Add the anchor cascade at `@maple-kit/core/anchor`.

  `describeElement` and `describeRange` record every rung a page can supply —
  `data-maple-key`, `data-maple-src`, `data-maple-name`, a text quote with its
  surrounding context, and a CSS path. `resolveAnchor` tries them most durable
  first and reports which one placed the comment and how far it is trusted.

  When no rung works the answer is an orphan carrying a reason — `empty`,
  `missing`, `ambiguous` or `changed` — never the nearest ancestor. About a
  quarter of anchors orphan over time, so saying so is the feature.

- d2f84b7: Let the route choose a store per request, so a credential can be per reviewer.

  `RouteOptions.store` took one connector, built once, holding one token. That is
  the right shape for a store the deployment owns and the wrong one for a store
  the reviewer owns: with a GitHub token per person, the connector that holds it
  differs per request.

  It now also takes a resolver — `(request: IdentityRequest) => StoreConnector |
null`, sync or async — called on every request that needs a store. Returning
  null means this reviewer has nowhere to write yet, and the route answers 401
  rather than writing the comment as somebody else.

  `/me` never resolves a store, because asking who someone is must work before
  they have linked anything. A wrong method is answered before the resolver is
  asked, since that is not a credential problem.

  **Not breaking:** passing a connector still works and is unchanged.

- 5eec274: **Breaking within 0.x:** `Comment` and `NewComment` now carry `branch`.

  A store filters by branch on `list` but `append` was given no way to know which
  branch a comment belonged to. The reference connector smuggled it through
  `anchor.key`, which no real backend could imitate: a GitHub PR store has to
  resolve a branch to a pull request before it can write anything.

- a96ffa4: Say out loud when a request did not work, instead of drawing nothing.

  Every failure the overlay could hit was silent. A 401 on the list rendered as
  "Nothing here under this filter", which reads as a branch nobody has commented
  on. A 401 on a send rendered as a button that did not move — and a reviewer
  retries a button forever, where they read a sentence once and act on it. On a
  preview whose store is built per reviewer, that is the **first** thing anyone
  sees, and it said nothing at all.

  **Breaking.** `ClientState.error` is a `MapleFailure`, not a string:

  ```ts
  interface MapleFailure {
    kind: "offline" | "store" | "unauthorized" | "unknown";
    message: string; // already addressed to a reviewer
    during: "link" | "load" | "send" | "status";
    status?: number;
  }
  ```

  A string could not be branched on, so no surface could tell "sign in first"
  from "the store is down" from "you are offline" — and those have three
  different answers. `failureFrom` builds one; the route's own words go to the
  logger instead of the page, because a connector's message can name a repository
  or a rate limit.

  `MapleClient` gains `clearError()`. `setStatus` no longer throws past the
  binding into a click handler; it records the failure like the other three.

  `load()` now asks `GET /me` **alongside** the list rather than after it. A 401
  on the comments is usually a reviewer who has not signed in, and the sign-in is
  the thing `/me` reports — so the one case that needed the offer was the one
  case that never fetched it.

  New in `@maple-kit/ui`, on its own subpath `@maple-kit/ui/notice`:
  `Maple.Notice`, one band carrying the sentence and the single thing that would
  fix it — **Sign in** under a 401 where a sign-in is on offer, **Try again**
  under anything retryable, and no offer at all where the deployment serves no
  sign-in, because pointing at a door that is not there is worse than silence.
  The default composition mounts one in the island for `load`, `status` and
  `link`, and one in the composer for `send`.

  `Maple.List` no longer claims a branch is empty when it failed to read it.

- 69ba1e5: Let a reviewer link their GitHub account from the overlay.

  `ClientState.github` carries the link, and it has four states rather than a
  boolean. `unsupported` is a route that serves no sign-in at all, which is a
  deployment storing comments some other way — not a reviewer who has not linked.
  A surface draws nothing for the first and an offer for the second, so the two
  must not collapse.

  `MapleClient` gains `linkGitHub()` and `unlinkGitHub()`. The first resolves as
  soon as there is a code to show and keeps polling after it; watch `github` for
  the rest. The wait is here rather than in a held-open request, because a person
  takes minutes to read a code, reach github.com and type it.

  `@maple-kit/react` gains `useGitHubLink()`. `@maple-kit/ui` gains
  `Maple.Account`, the row the settings panel now opens with: the offer, the code
  and where to type it, or the account and a way to forget it here. It says
  plainly that forgetting the token is not revoking the authorisation, because a
  reviewer who thinks it is will not revoke.

  **Breaking:** `Transport.me()` returns `{ user, github? }` rather than the user
  alone, so the link state travels with the identity it belongs to.

  The island's bundle budget goes from 21 KB to 22 KB gzipped. It was at 21.0 with
  this row in it, which is not a number to leave a build standing on.

- 16f5582: Record what a reviewer calls a preview, and which commit it was serving.

  A preview hostname carries a shortened branch — a ticket key, or a name cut to
  fit a DNS label — and that shortening is lossy, so the string a person reads is
  not the string a store resolves a pull request from. `Comment.label` carries the
  readable one and `Comment.branch` stays the identifier; `Comment.commit` carries
  the exact thing the label is an abbreviation of, and is what a later re-verify
  compares against.

  Both are optional and set by the application: `<Maple branch label commit>` on
  the component, `label` and `commit` on `MapleClientOptions`. The branch chip in
  the island reads the label and keeps the branch as its title, because a label is
  what you recognise and a branch is what you copy. Neither field is ever shed by
  the export fence's byte budget.

  The route takes both off the draft the way it already takes the branch and the
  URL — the client describes its own page — and checks only that a commit is
  shaped like one. The author stays the route's to decide.

  **Breaking:** `MapleRootProps.options` now omits `label` and `commit` as well as
  `branch`. The three are props on the component, so passing them twice could
  disagree; move them out of `options`.

- 9fcecc0: Add GitHub Device Flow at `@maple-kit/core/auth`.

  `createDeviceFlow({ clientId })` gives a reviewer a short code to type, then
  waits for them, honouring GitHub's polling interval and its `slow_down`
  back-off. A preview URL differs on every deployment, so there is no stable
  callback to register; Device Flow needs none.

  It runs on the SDK route. A device code and a token are both credentials and
  neither belongs in a bundle the browser downloads.

- 33c1689: Add the SDK route at `@maple-kit/core/route`.

  `createMapleHandler({ store, identity })` is a web-standard handler — a
  `Request` in, a `Response` out — so the same code serves a Next route handler,
  a Vite middleware, Hono and a Worker. `toNodeMiddleware` adapts it for connect,
  and the Vite plugin mounts it on the dev and preview servers when given a
  `route` option.

  The author of a comment comes from the identity connector and never from the
  request body, and a connector's error message goes to the log rather than to
  the browser.

- 55dddc9: Picking works end to end, and one import mounts all of it.

  `Maple.Picker` in `@maple-kit/ui/picker` runs the gesture an armed pick starts
  and opens the composer on what it finds — until now `arm()` set a flag nothing
  read. `@maple-kit/ui/maple` exports `<Maple branch="…" />`, the whole reviewer
  interface as one element, for an application that wants the default.

  A screenshot of the page is taken at pick time, before the panel insets the
  layout it is over, and lands in the composer on its own; paste and drop
  override it and there is no button for either. Clicking a comment opens the
  panel on it to read, with the context badge and the screenshot a row cannot
  carry. Escape shuts the newest surface first: the panel, then the settings,
  then the island.

  The overlay's scheme and the island's corner are now the viewer's, remembered
  per origin and settable from the island's settings: `client.setTheme()`,
  `?maple-theme=`, and a corner picker beside it.

  **Breaking:** `PartForm` is now `"outline" | "partial" | "solid"` — a leaf
  fills up as a comment goes through its life rather than emptying out, so open
  is an outline, re-verify is half and resolved is full. `useOverlayScheme()`
  takes no argument and reads the viewer's preference from the controller.
  `MapleAttachments` no longer takes `capture`, and `Tip` moved from
  `@maple-kit/ui/island` to the package root.

- bf6e1ea: Add `@maple-kit/core/client`, the reviewer interface's state machine.

  `createMapleClient({ branch })` is a plain object with `subscribe` and
  imperative methods: the comment list and its five filters, the composer, the
  pick, a draft's whole life, the navigation guard and theme detection. No React
  and no DOM until `start()`, so a binding for React, Svelte or Astro is a
  subscription over it rather than a second implementation of it.

  A draft is written 400ms behind the keystroke, keyed by branch and anchor,
  expired after a week, cleared by a send and never by a close, and reconciled
  across tabs so one tab cannot hand back a comment another already posted.
  `beforeunload` exists only while a draft is dirty, because leaving it attached
  costs the host application its bfcache.

  The overlay's scheme is the opposite of the host's; the scheme a comment
  records is the host's. Those are two facts, and this is where they stay apart.

### Patch Changes

- 061766e: Update Effect to 3.20.0.
- 417376e: Every package publishes its licence, its notice and a readme. `files` was
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

- 567b444: Ship the docs in the type declarations and not in the JavaScript.

  Prose was about 46% of `@maple-kit/ui`'s gzipped weight, which is weight every
  application downloads to read something no runtime looks at. Every package's
  build now drops JSDoc from the emitted JavaScript and keeps it in the `.d.ts`,
  which is what an editor reads anyway.

  Two kinds of comment are kept deliberately. `@__PURE__` and
  `@__NO_SIDE_EFFECTS__` stay, because dropping them would silently cost
  tree-shaking. Legal notices stay, and the two ported files in
  `packages/core/src/lib/` are now marked `@preserve` so their BSD-2-Clause and
  MIT attributions reach the published build, which those licences require.
