# Maple

Visual review comments on deployed previews, written for people and read by
agents.

A reviewer points at something on a preview deployment and says what is wrong.
Maple captures where they pointed, what they were looking at and who they are,
hands it to a coding agent in a form it can act on, and holds the merge until
every comment is resolved.

**Status: pre-release.** Nothing is published yet. The contracts below are
stable; the implementations behind them are not written.

## Why another one

Pincushion, Vercel Toolbar, Chromatic, BugHerd and Marker.io each do some of
this. None combines all four of:

- **Open source**, Apache-2.0, with no hosted service required.
- **Deployed previews**, not a development server.
- **A merge gate** — CI blocks while a visual comment is unresolved.
- **An agent loop** — the agent reads comments, fixes, and resolves them.

## Vendor-agnostic by construction

Maple stores nothing itself. A connector is one file implementing plain
Promise-returning methods:

```ts
import type { StoreConnector } from "@maplekit/core/connectors";

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

| Package          | What it is                                   |
| ---------------- | -------------------------------------------- |
| `@maplekit/core` | Server SDK, overlay and connector contracts. |
| `@maplekit/cli`  | The `maple` command.                         |
| `@maplekit/mcp`  | The MCP server an agent talks to.            |

The product is Maple, the binary is `maple`, and the packages are `@maplekit/*`
because `maple` on npm is taken.

## Documentation

- [Connectors and the capability matrix](docs/connectors.md)
- [The JSX tagger](docs/tagger.md) — how a comment becomes `file:line`
- [The overlay and CSP](docs/overlay-csp.md) — what Maple asks of your policy
- [Owner setup](docs/setup-owner.md)
- [What Phase 0 delivered](STATUS.md)

## Development

```
pnpm install
pnpm hooks
pnpm lint && pnpm typecheck && pnpm test
```

Requires Node 22.13 or newer and pnpm 10. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Apache-2.0. Contributions are accepted under the
[Developer Certificate of Origin](DCO) — sign off with `git commit -s`. There is
no CLA.
