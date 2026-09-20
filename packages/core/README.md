# @maple-kit/core

The server SDK, the overlay and the connector contracts for
[Maple](https://github.com/maple-kit/maple) — visual review comments on deployed
previews, written for people and read by agents.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Install

```sh
npm install @maple-kit/core
```

## Entrypoints

| Import                       | What it is                                                          |
| ---------------------------- | ------------------------------------------------------------------- |
| `@maple-kit/core`            | Comment types, the connector contracts, `createCommentStore`        |
| `@maple-kit/core/route`      | The SDK route a host application mounts at `/api/maple/*`           |
| `@maple-kit/core/client`     | The framework-free reviewer controller the bindings wrap            |
| `@maple-kit/core/overlay`    | The shadow-root host, the pickers and the anchor cascade            |
| `@maple-kit/core/anchor`     | Anchoring and re-anchoring, five rungs with four orphan reasons     |
| `@maple-kit/core/connectors` | The bundled connectors, starting with the GitHub pull-request store |
| `@maple-kit/core/gate`       | The merge gate's decision, independent of any forge                 |
| `@maple-kit/core/auth`       | GitHub Device Flow, including the `slow_down` back-off              |
| `@maple-kit/core/export`     | Markdown with a visible ` ```maple ` fence                          |
| `@maple-kit/core/screenshot` | Paste, drop and file capture, with snapdom as an optional peer      |
| `@maple-kit/core/tagger`     | The JSX tagger that turns a comment into `file:line`                |
| `@maple-kit/core/vite`       | The Vite plugin: tagger transform plus the mounted route            |
| `@maple-kit/core/next`       | `withMaple`, both halves of the Next case                           |
| `@maple-kit/core/loader`     | The Turbopack loader the Next path uses                             |
| `@maple-kit/core/logger`     | `createLogger({ sinks })`                                           |
| `@maple-kit/core/config`     | Standard Schema validation of Maple's own options                   |
| `@maple-kit/core/testing`    | The shared connector contract suite. Needs `vitest`                 |

`@maple-kit/core/testing` declares `vitest` as an optional peer dependency: it
registers its tests against whichever runner you invoke, so it has to be yours.

## Documentation

- [Connectors and the capability matrix](https://github.com/maple-kit/maple/blob/main/docs/connectors.md)
- [The overlay and CSP](https://github.com/maple-kit/maple/blob/main/docs/overlay-csp.md)
- [The JSX tagger](https://github.com/maple-kit/maple/blob/main/docs/tagger.md)
- [The merge gate](https://github.com/maple-kit/maple/blob/main/docs/gate.md)

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
