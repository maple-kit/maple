---
"@maple-kit/core": minor
"@maple-kit/mcp": minor
---

**Breaking:** `CommentStore` covers all nine `StoreConnector` methods, and the
route and the MCP server now take one instead of a raw connector.

`createCommentStore` wrapped three of nine methods and nothing inside Maple
called it: the SDK route held a raw `StoreConnector` and so did the MCP server,
so the retry, timeout and `MapleStoreError` layer reached one external caller
and nothing a reviewer touched. The preview route now has retries.

What changed for a host:

- **`RouteOptions.store` takes a `CommentStore`**, as does a `StoreResolver`'s
  return. Wrap the connector: `store: createCommentStore(githubStore({ … }))`,
  or inside the resolver where the store is built per reviewer. A connector
  missing `list` or `append` now fails at construction rather than on the first
  request.
- **`GateContext.store`** — what `publishGate` takes — and the MCP server's
  `HandlerOptions.store` take a `CommentStore` for the same reason.
- **`CommentStore` gained `appendMany`, `head`, `watch`, `approvals`,
  `approve` and `unapprove`**, and `setStatus` gained the `resolution`
  argument the connector has taken since 0.5. A capability the connector lacks
  resolves to an absent value — `undefined` for the three reads, `null` for
  `approve`, `false` for `unapprove` — never to an empty one, because
  `decideGate` reads an empty approvals list as "nobody approved" and would
  block for ever on a store that keeps none. `capabilities` reports what the
  connector can do; the return value reports what happened.
- **A store failure is no longer always a 400.** The route answers `503` when
  the store could not be reached and keeps `400` for a store that refused.
- **A `RangeError` from a connector is no longer retried**, so a bad cursor or
  a negative limit is refused once rather than three times.

Nothing changed about what a store connector writes or reads, so a published
ledger stays readable by every version that could read it before.

`docs/connectors.md` has the table the wrapper is kept complete against.
