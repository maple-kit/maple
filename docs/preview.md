# Preview environments

A preview environment tells Maple which session a deployment is serving. It is
a small request-to-identity interface at `@maple-kit/core/preview`, not a
connector: a connector talks to a backend, and this reads a request.

```ts
import { mirrord } from "@maple-kit/core/preview";

const preview = mirrord({ env: process.env });
```

The SDK reads no env itself; the host passes `process.env`, and the preset
reads it once when it is built.

## mirrord

A preview pod serves exactly one session, so identity is a property of the pod.
The first signal that names a key wins:

| Order | Signal                                          | Why                                                                          |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | env `MAPLE_PREVIEW_KEY`                         | Set by `feature.env.override` (`{{ key }}` is templated). Always present.    |
| 2     | `mirrord-key` request header                    | Injected by the operator; gone when `operator.injectSessionKeyHeader=false`. |
| 3     | `mirrord-session` entry in the `baggage` header | Exact name match; the first entry wins; percent-decoded.                     |

The host is never used: a share link rewrites it. mirrord's default baggage
filter is a substring match (`maple-test2` reaches the `maple-test` preview),
which is why the header outranks baggage and the entry name is matched exactly.

`MAPLE_COMMIT` and `MAPLE_PULL_REQUEST` are facts the deploy states. They ride
with the env key, and with a header or baggage key only when the env names no
other key. A preview must run in `steal` mode; the mirrord default, `mirror`,
discards the preview's responses.

`matches(head, identity)` compares mirrord's own slug of the branch with the
slug of the key, so a key derived from a branch finds that branch.
