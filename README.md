# Maple

Visual review comments on deployed previews, written for people and read by
agents.

A reviewer points at something on a preview deployment and says what is wrong.
Maple captures where they pointed, what they were looking at and who they are,
hands it to a coding agent in a form it can act on, and holds the merge until
every comment is resolved.

**Status: pre-release.** Nothing is published yet. The contracts below are
stable and implemented; the reviewer-facing interface is still being built.

## Why another one

Pincushion, Vercel Toolbar, Chromatic, BugHerd and Marker.io each do some of
this. None combines all four of:

- **Open source**, Apache-2.0, with no hosted service required.
- **Deployed previews.** Maple runs on the preview URL your CI already builds,
  so anyone with the link can comment — a designer, a product manager, a client.
  Tools like Agentation run against `localhost`, which means the only person who
  can leave a comment is the person running the build.
- **A merge gate** — CI blocks while a visual comment is unresolved.
- **An agent loop** — the agent reads comments, fixes, and resolves them.

## Vendor-agnostic by construction

Maple stores nothing itself. A connector is one file implementing plain
Promise-returning methods:

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

There are four kinds — store, media, observability and identity — and a
connector's capabilities are exactly the methods it defines. See
[`docs/connectors.md`](docs/connectors.md).

## Packages

| Package           | What it is                                   |
| ----------------- | -------------------------------------------- |
| `@maple-kit/core` | Server SDK, overlay and connector contracts. |
| `@maple-kit/cli`  | The `maple` command.                         |
| `@maple-kit/mcp`  | The MCP server an agent talks to.            |

## Documentation

- [Connectors and the capability matrix](docs/connectors.md)
- [The JSX tagger](docs/tagger.md) — how a comment becomes `file:line`
- [The overlay and CSP](docs/overlay-csp.md) — what Maple asks of your policy
- [The agent loop](docs/agent-loop.md) — the MCP tools and the Stop hook

## Development

```
pnpm install
pnpm hooks
pnpm lint && pnpm typecheck && pnpm test
```

Requires Node 24, the active LTS, and pnpm 10. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Apache-2.0. Contributions are accepted under the
[Developer Certificate of Origin](DCO) — sign off with `git commit -s`. There is
no CLA.
