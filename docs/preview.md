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

## The route

```ts
createMapleHandler({
  preview: mirrord({ env: process.env }),
  github: { owner, repo },
  githubAuth,
});
```

A request the preview does not recognise is answered 404 on every route,
including `/context`. `GET {basePath}/context` answers:

```json
{
  "preview": "mirrord",
  "key": "…",
  "branch": "head ref, or the key",
  "label": "…",
  "commit": null,
  "pullRequest": 123,
  "resolved": true,
  "reason": null
}
```

Without a linked reviewer it returns what is knowable (`resolved: false`,
`reason: "sign-in"`). Other reasons: `none`, `ambiguous`, `no-access`,
`unconfigured`; a GitHub outage is a 502.

The pull request is found in order: `MAPLE_PULL_REQUEST` (only while open), the
commit, the head branch named exactly the key, then the preview's `matches`.
Several matches never resolve: reads and writes both answer 409 (`GET /comments`
included) and nothing is written. A commit counts only through its open pull
requests. In a stack a commit sits in several: the one whose head is the stated
branch or the key wins, then the later rungs choose, and it is ambiguous only
if they cannot. A closed pull request is never resolved. A sha GitHub does not
know is no hit, and the lookup goes on to the head branch. "None", ambiguous
and 401, 403 and 404 answers are kept for 15 seconds and a resolved pull request
for five minutes, per reviewer, so one page load asks GitHub once.

Per-request `store`, `media`, `gate` and `identity` callbacks receive the
resolved session as `request.preview` (`key`, `label`, `branch`, `commit`,
`pullRequest`), so a host does not re-read headers. `/me` and `/auth/*` never
ask GitHub, so there `request.preview` is unresolved: `branch` is the key and
there is no `pullRequest` unless the deploy stated one.
