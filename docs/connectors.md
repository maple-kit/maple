# Connectors

A connector is one file. It implements a plain interface of Promise-returning
methods, and that is the whole contract — there is no registration step, no base
class, and no Effect.

```ts
import type { StoreConnector } from "@maple-kit/core/connectors";

export function myStore(options: MyOptions): StoreConnector {
  return {
    name: "my-store",
    async list(query) {
      /* … */
    },
    async append(comment) {
      /* … */
    },
  };
}
```

## Capabilities are methods

A connector's capabilities are exactly the methods it defines. There is no
second place to declare them, so the two cannot disagree.

```ts
import { capabilitiesOf } from "@maple-kit/core/connectors";

capabilitiesOf("store", myStore(options));
// { list: true, append: true, setStatus: false, head: false, watch: false,
//   approvals: false, approve: false, unapprove: false }
```

Maple degrades around a missing optional method rather than failing. A store
without `setStatus` keeps status client-side, and the CI gate reports `neutral`
instead of blocking — `decideGate` takes `statusTracked` for exactly that, and
`docs/gate.md` says why neutral is not the same as clear.

`setStatus` takes an optional third argument, a `CommentResolution` — the commit
an agent says addressed the comment, an optional note, and the time the write
happened. A store that cannot keep it records the status alone; it never refuses
the call, because the status is the part the gate reads.

`approvals` and `approve` are a pair, and a store implements both or neither: one
that can record a sign-off it cannot read back has recorded nothing the gate can
act on. `unapprove` is separate, because an append-only backend can hold an
approval and not take it away. A store with none of the three makes a gate that
was told to require an approval report `neutral` rather than block for ever —
`docs/gate.md` has the reasoning.

Omitting a **required** method is an error, raised at construction time by
`createCommentStore` rather than on the first request.

## The six kinds

Run `maple connectors` to print this from the code.

| Kind            | Required            | Optional                                                          |
| --------------- | ------------------- | ----------------------------------------------------------------- |
| `store`         | `list`, `append`    | `setStatus`, `head`, `watch`, `approvals`, `approve`, `unapprove` |
| `media`         | `putBlob`, `getUrl` | `remove`                                                          |
| `observability` | `getReplayLink`     | `fetchEvents`                                                     |
| `identity`      | `resolveUser`       | —                                                                 |
| `gate`          | `publish`           | `read`                                                            |
| `classifier`    | —                   | `score`, `classify`                                               |

`classifier` is the one kind that requires nothing: both of its methods are
optional, so one defining neither is inert rather than invalid. `docs/assist.md`
is its design record, and it is the only kind whose answers a reviewer reads
rather than acts on — a score never blocks, gates, delays or rewrites a send.

A backend can be more than one kind. One object may implement `StoreConnector`
and `IdentityConnector` at once; Maple checks the methods it needs for the role
it is filling it in.

## Capability matrix

`✓` implemented · `—` not implemented · `~` implemented with a caveat, explained
below the table.

| Connector            | list | append | setStatus | head | watch | approvals | approve | unapprove | putBlob | getUrl | getReplayLink | fetchEvents | resolveUser | publish | read | score | classify |
| -------------------- | ---- | ------ | --------- | ---- | ----- | --------- | ------- | --------- | ------- | ------ | ------------- | ----------- | ----------- | ------- | ---- | ----- | -------- |
| `github` (store)     | ✓    | ✓      | ✓         | ✓    | —     | ✓         | ✓       | ✓         | —       | —      | —             | —           | —           | —       | —    | —     | —        |
| `github` (gate)      | —    | —      | —         | —    | —     | —         | —       | —         | —       | —      | —             | —           | —           | ✓       | ✓    | —     | —        |
| `memory` (reference) | ✓    | ✓      | ✓         | ✓    | —     | ✓         | ✓       | ✓         | —       | —      | —             | —           | —           | ✓       | ✓    | ✓     | ✓        |
| `keyword` (baseline) | —    | —      | —         | —    | —     | —         | —       | —         | —       | —      | —             | —           | —           | —       | —    | ✓     | ✓        |
| `datadog`            | ~    | ✓      | ~         | —    | —     | —         | —       | —         | —       | —      | ~             | ✓           | ~           | —       | —    | —     | —        |

The reference connector lives in `@maple-kit/core/testing` and exists so the
contract suite has something to run against. It is not for production.

`keyword` is the exception that is: it ships from `@maple-kit/core/connectors`,
needs no network, no model and no configuration, and is what the assist tier
does with the model tier switched off. See `docs/assist.md`.

## GitHub

The default store, and the reason Maple needs no infrastructure to be useful. A
pull request is already branch identity, authentication, durability, threading,
resolve semantics and notifications; a SQLite file in a preview pod is none of
those and loses comments exactly when people write them.

### One ledger, reposted

**Everything Maple keeps on a pull request lives in one issue comment.** It
carries a table of every visual comment, the sign-offs under it, and one fence
holding all of them. It was one issue comment _per comment_ until #100, which
bought GitHub's own threading and cost the thing people actually noticed: ten
visual comments were ten comments on the pull request, and the review was
unreadable underneath them.

The cost of collapsing them is that **editing a comment notifies nobody**. So a
write that is news — a new visual comment, a new approval — does not edit. It
posts the rebuilt ledger and then deletes the old one, so the pull request has
exactly one Maple comment, always at the bottom, and every new comment reaches
whoever is subscribed. A write that is not news — a resolve, a withdrawal —
edits in place, because moving the whole thread to announce that something a
reviewer just clicked is done is noise.

**The new one is created before the old one is deleted.** The other order loses
every comment on the pull request if the process dies between the two calls.
This order leaves two ledgers, which `list` survives: it takes the newest and
ignores the rest, and the next write deletes them. A `DELETE` that fails is
swallowed for the same reason.

The ceiling is GitHub's 65,536-character body. The fence is held under 40,000
of it and sheds detail in the usual order to get there; the table above it is
not budgeted, so a pull request with hundreds of visual comments will overflow
before Maple complains. That is a limit worth knowing and not one worth
engineering around yet.

**A fence anywhere else on the pull request is read as a ledger.** Anything
summarising a pull request therefore passes `fence: false` to `exportMarkdown`
and writes the table alone — otherwise the summary shadows the real ledger and
the comments in it become unreachable.

### What it costs

| Method      | How                                                      | Cost                                                                 |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `list`      | `GET /issues/{pull}/comments` until the ledger is found. | One extra call to find the pull request, unless a `cache` holds it.  |
| `append`    | Read the ledger, `POST` the new one, `DELETE` the old.   | A read plus two writes. The read is what makes the append additive.  |
| `setStatus` | Read the ledger, rewrite its fence, `PATCH` it back.     | A read plus one write, and no notification.                          |
| `approve`   | Read the ledger, `POST`, `DELETE`, as an append.         | Same as `append`: a sign-off is news.                                |
| `unapprove` | Read the ledger, `PATCH` it back.                        | Same as `setStatus`.                                                 |
| `head`      | `GET /pulls/{pull}` for its head sha.                    | One call per gate publish. The sha is never cached; a push moves it. |

A comment id is `gh_<pull>_<n>` and an approval id `gha_<pull>_<n>`, where `n`
is one past the highest the ledger has used. The id carries its pull request,
so a write needs no index and no cache and works in a process that never ran
`list`. `n` is **not** the issue comment's id any more: the ledger's own id
changes on every repost, and an id that moved would break every link to it.

### What it cannot do

- **No `watch`.** GitHub has no long-poll for issue comments. The agent loop
  polls `list` instead; US2's webhook is the eventual answer.
- **Issue comments only.** Review comments on a diff are a different API and are
  not read. Maple's comments are on a rendered page, not a hunk.
- **A branch with no pull request has nowhere to go.** `list` returns an empty
  page, which is honest — there is nothing there. `append` throws rather than
  inventing a home for the comment.
- **A branch with several pull requests resolves to the first.** GitHub returns
  them newest first; Maple does not guess between them.

### Finding the pull request

The branch name is the easy case and not the common one. A preview hostname has
to be a DNS label, so what it usually carries is a ticket, a shortened branch,
or nothing — while the build knows its commit for certain. `pull` says how the
identifier the overlay sends becomes a pull request, and it is tried in this
order:

1. **`pull.commit`** — `GET /commits/{sha}/pulls`, which names the pull request
   outright rather than inferring it. Stamp it from whatever your CI sets.
2. **The identifier as the head branch's own name**, which is the plain case.
3. **`pull.matches(head, identifier)`** — asked per open pull request, most
   recently updated first, so an application supplies its own rule and not a
   GitHub client.

```ts
githubStore({
  owner,
  repo,
  token,
  pull: { commit: process.env.GIT_SHA, matches: (head, ticket) => head.startsWith(ticket) },
  cache,
});
```

`cache` is a `createPullCache()`, and it is a parameter rather than a closure on
purpose: a per-reviewer credential means a store built **per request**, so a
cache inside one would be thrown away with it. Create one per process and pass
it to every store. Only a hit is kept — a branch is pushed, the preview builds,
and the pull request is opened after that, so a miss has to be re-asked.

### Configuration

- One `token`, a user-to-server or installation token, read on the SDK route and
  never sent to the overlay. `pull_requests: write` is the only scope needed.
- `baseUrl` for GitHub Enterprise Server; it defaults to `api.github.com`.
- Rate limits surface as the error GitHub sent, message intact, so core can
  decide what to retry.

## Datadog

Datadog is a strong observability connector and a lossy store. Both are worth
having, and the limits below are the reason the capability matrix has three `~`
marks rather than three `✓`.

### As a store — usable, with real losses

| Method      | How                                                                                                 | Caveat                                                   |
| ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `append`    | A RUM custom action through the application's existing client token, or the server-side events API. | —                                                        |
| `list`      | `POST /api/v2/rum/events/search`, with an API key and an app key carrying `rum_apps_read`.          | Server-only, and **1–60 seconds eventually consistent**. |
| `setStatus` | A tombstone event, reduced latest-wins on read.                                                     | Status is derived, not stored.                           |
| —           | Editing and deleting do not exist.                                                                  | —                                                        |

The consequence that shapes the code: **RUM has no read-your-writes.** A comment
that was just appended will not appear in the next `list`. Maple keeps the local
draft until a read-back confirms the write, and the contract suite's
`eventualConsistencyMs` option exists for exactly this connector.

Events also expire, on the retention the RUM plan sets. A store whose contents
vanish after a fixed window is acceptable for a preview's review cycle and not
for anything longer.

### As an observability connector — the strong case

| Method          | How                                                                                  | Caveat                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getReplayLink` | Build `/rum/replay/sessions/<id>?seed=<view>&from=<ts>` from `getInternalContext()`. | The SDK's own `getSessionReplayLink()` takes no arguments, so the timestamped URL is constructed by hand. **Verify the URL shape on an EU organisation before promising timestamped links.** |
| `fetchEvents`   | Actions, views, errors and resources in the 60 seconds before the comment.           | Session evidence only. There is no replay export API.                                                                                                                                        |

### As an identity connector — client provenance only

`resolveUser` reads the `usr.*` attributes the application set through
`setUser`. Those come from the browser, so a comment resolved this way is
stamped `provenance: "client"` and rendered as unverified. A server-side
`resolveUser` on the SDK route is always the better source when one exists.

### Media

None. Datadog stores no blobs. Pair it with an S3/R2 media connector, or with
`.maple/shots/` in the repository when the agent runs locally.

### Configuration

- The Datadog **site** must be set explicitly; the US and EU sites are different
  hosts and a wrong one fails as an authentication error.
- The API and app keys are server-side credentials. They are read by the SDK
  route and must never reach the overlay bundle.
- No new CSP directive is needed where the application already proxies RUM
  intake through its own origin.

## Contributing a connector

Run the `contribute-connector` skill. It scaffolds the file from a template,
runs the shared contract suite against it, and emits the row to paste into the
matrix above.

The contract suite is the gate:

```ts
import { runStoreContract } from "@maple-kit/core/testing";

runStoreContract({
  name: "my-store",
  create: async () => ({ connector: myStore(testOptions), cleanup: () => reset() }),
  // Only for backends without read-your-writes.
  eventualConsistencyMs: 5_000,
});
```

If it passes, Maple can use the connector. If it fails, the failure names the
promise that was broken.
