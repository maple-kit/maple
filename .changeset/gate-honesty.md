---
"@maple-kit/core": minor
"@maple-kit/mcp": minor
---

The gate hears about a resolve whoever did it, and `needs_reverify` is reachable.

`resolve_comment` wrote the status and stopped. The route has published a
verdict after a resolve since 0.6.0 — a reviewer who clears the last comment
should not wait for a commit nobody needs to make — and the agent, doing the
same thing through a different door, did not. An agent that resolved the last
comment and had nothing left to push left `maple/visual-review` holding on work
that was done.

`publishGate` therefore moves from `src/route/gate.ts` to `@maple-kit/core/gate`
beside the decision, and the MCP server takes an optional `gate` built from
`MAPLE_GATE_TOKEN`. Without it nothing publishes and the behaviour is what it
was.

`decideGate` also gains `reverifyResolved`, which is what makes `needs_reverify`
reachable at all: nothing in the repository ever wrote that status, so a gate
that listed it among `BLOCKING_STATUSES` was blocking on a state that could not
occur. On, a comment resolved against a commit that is no longer the head needs
another look. Off by default.

`docs/gate.md` now also states plainly that **nothing writes `orphaned` either**,
and why the page cannot simply report it.
