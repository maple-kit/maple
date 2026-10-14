# Preview environments

A preview environment tells Maple which session a deployment is serving, so a
reviewer's comments land on the right pull request without a build-time stamp.
It is a small request-to-identity interface at `@maple-kit/core/preview`, not a
connector: a connector talks to a backend, and this reads a request.

The SDK reads no env itself. The host passes `process.env`, and the preset reads
it once when it is built.

## mirrord

mirrord is the first preset. Behaviour below was observed with mirrord operator
3.219 and CLI 3.272.

### Set it up

```ts
import { createLogger, consoleSink } from "@maple-kit/core/logger";
import { mirrord } from "@maple-kit/core/preview";

createMapleHandler({
  preview: mirrord({ env: process.env }),
  github: { owner: "acme", repo: "shop" },
  githubAuth,
  logger: createLogger({ sinks: [consoleSink()] }),
});
```

Maple's warnings about a preview go through `logger`; without it they are not
logged.

Mount `<Maple />` with no props. It asks `GET {basePath}/context` which session
and pull request it is on, so nothing is stamped into the page.

Then give the pod its identity from the mirrord config:

```
maple setup preview mirrord --write
```

It adds `feature.env.override` to each preview config in `.mirrord/*.json` (a
file whose name contains `preview`, a top-level `key`, or a `feature.preview`
section; other configs are listed and left alone, and `--config <file>` names
one), creating `.mirrord/preview.json` when there is no config. It sets
`feature.network.incoming.mode` to `steal` when the config says nothing and
never overwrites a value that is set. Without `--write` it prints what it would
change.

With `--write`, and when `mirrord` is installed, it then runs
`mirrord verify-config --resolved`. mirrord cannot render a top-level
`"key": "{{ key }}"`, which refers to itself, so a config whose own `key` is
missing or a template is verified as a temp copy with a literal `key`, removed
afterwards. The file you keep is never touched, and a failure exits 1.

```json
{
  "feature": {
    "network": { "incoming": { "mode": "steal" } },
    "env": {
      "override": {
        "MAPLE_PREVIEW_KEY": "{{ key }}",
        "MAPLE_PULL_REQUEST": "{{ get_env(name='MAPLE_PULL_REQUEST', default='') }}",
        "MAPLE_BRANCH": "{{ get_env(name='MAPLE_BRANCH', default=get_env(name='GITHUB_HEAD_REF', default='')) }}",
        "MAPLE_REF": "{{ get_env(name='MAPLE_REF', default=get_env(name='GITHUB_REF', default='')) }}",
        "MAPLE_COMMIT": "{{ get_env(name='MAPLE_COMMIT', default='') }}"
      }
    }
  }
}
```

mirrord renders these with Tera when `mirrord preview start` runs: `{{ key }}` is
the `-k` value and `get_env` reads the runner's environment. On GitHub Actions
that is the whole setup, including a preview deployed by a reusable workflow in
another repository: no workflow step is needed.

On other CI, export `MAPLE_PULL_REQUEST` (a number) or `MAPLE_BRANCH` (the head
branch) before `mirrord preview start`. `MAPLE_COMMIT` is optional on every CI.
To verify by hand, run `mirrord verify-config --resolved <file>` on a config
with a literal top-level `key`. With `"key": "{{ key }}"`, with or without
`--resolved`, it fails with ``Variable `key` not found``; that is mirrord, not
the override.

### How Maple identifies the preview

A preview pod serves exactly one session, so identity belongs to the pod. The
first signal that names a key wins:

| Order | Signal                                          | Notes                                                                                               |
| ----- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | env `MAPLE_PREVIEW_KEY`                         | Holds under every traffic filter and operator setting.                                              |
| 2     | `mirrord-key` request header                    | The operator sets it and replaces a client's own. Absent on traffic that did not reach the preview. |
| 3     | `mirrord-session` entry in the `baggage` header | Exact entry name; the first entry wins; percent-decoded.                                            |

The host is never used. A share link rewrites it to the target's service name,
and the share slug is lossy: `PR_123/Foo.Bar` becomes `pr-123-foo-bar`.

Baggage is last because mirrord's default filter is a substring regex. A request
with `mirrord-session=maple-test2` reaches the `maple-test` preview, where
`mirrord-key` says `maple-test` and baggage says `maple-test2`. For the same
reason, never match baggage by substring.

The deploy also states facts, which ride with the env key, and with a header or
baggage key only when the env names no other key. Empty values count as unset.

| Env                  | Meaning                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `MAPLE_PULL_REQUEST` | A bare pull request number.                                                                  |
| `MAPLE_BRANCH`       | The exact head branch.                                                                       |
| `MAPLE_REF`          | A Git ref. `refs/pull/<n>/merge` (or `/head`) gives the number, `refs/heads/<b>` the branch. |
| `MAPLE_COMMIT`       | The commit the preview was built from.                                                       |

The number comes from `MAPLE_PULL_REQUEST`, else from `MAPLE_REF`; the branch from
`MAPLE_BRANCH`, else from `MAPLE_REF`. GitHub sets `GITHUB_HEAD_REF` to an empty
string on a push, and `get_env` falls back only for an unset variable, so a push
reaches Maple as `MAPLE_REF=refs/heads/<branch>` with an empty `MAPLE_BRANCH`.

Only the env is exact. With `operator.injectSessionKeyHeader=false` a client can
send `mirrord-key` itself, and baggage reports the key the request carried, which
mirrord's substring filter may have delivered to another session's pod. When the
key comes from a header or baggage, Maple logs a warning saying so. It logs at
most one warning per handler: when `MAPLE_PREVIEW_KEY` is not set at all, that
warning is the one, and the header or baggage one is not logged as well. Both
need `logger` on the handler.

### How Maple finds the pull request

Resolution runs as the signed-in reviewer and stops at the first hit:

1. The stated pull request, while it is open.
2. `MAPLE_BRANCH`: the open pull request whose head is exactly that branch.
3. The commit, from `MAPLE_COMMIT`, through its open pull requests only. A sha
   GitHub does not know is no hit, and resolution goes on. A commit in several
   open pull requests (a stack) resolves to the one whose head is the stated
   branch or the key; otherwise the later rungs choose.
4. An open head branch named exactly the key. A preview never resolves a
   closed pull request.
5. The preview's `matches(head, identity)`. The mirrord preset compares
   mirrord's own slug of the branch with the slug of the key.

Several matches never resolve, whether open pull requests containing the commit
(when no later rung picks one) or heads matching the key. Reads and writes both
answer 409 (`GET /comments` included) and nothing is written.

A resolved pull request is kept for five minutes, and "none", ambiguous and 401,
403 and 404 answers for 15 seconds, each per reviewer token: one reviewer's
refusal or access says nothing about the next, and one page load asks GitHub
once.

### A key that is not a branch name

The slug comparison fits a key that is a branch name. When the key is something
else, such as a ticket shared by several branches, pass `matches`:

```ts
preview: mirrord({
  env: process.env,
  matches: (head, identity) => head.toLowerCase().startsWith(`${identity.key.toLowerCase()}-`),
}),
```

With the key `ENG-884`, the open branch `eng-884-remove-flag` matches. `matches`
replaces the slug rule, so it runs only after the earlier rungs found nothing,
and two matching branches are ambiguous. On a deploy without `MAPLE_PULL_REQUEST`,
`MAPLE_BRANCH` or `MAPLE_COMMIT`, this rung is the only one that can find the
pull request.

To resolve an ambiguous ticket, state the pull request or the branch in the
deploy: they are tried before `matches`. On GitHub Actions the config above does
that already, through `MAPLE_REF` and `MAPLE_BRANCH`.

### Steal, not mirror

A preview must run with `feature.network.incoming.mode` set to `steal`. Without a
config file the CLI defaults to `mirror`: the preview gets a copy of every
request, its responses are discarded, and the original app keeps serving users.
`maple setup preview mirrord` warns about any other mode and leaves it alone.

### `injectSessionKeyHeader=false`

With `operator.injectSessionKeyHeader=false` the operator injects no
`mirrord-key` header, on requests or responses. The env override is unaffected,
so a pod configured as above still knows its key. A pod without the override
falls back to baggage, which exists only under the default filter or a share
link. With a header or path filter and no override, the pod has no key at all
and every route answers 404; with `logger` set, Maple logs one warning at the
first request.

## The route

A request the preview does not recognise is answered 404 on every route,
including `/context`. `GET {basePath}/context` answers:

```json
{
  "preview": "mirrord",
  "key": "…",
  "branch": "head ref, else the stated branch, else the key",
  "label": "…",
  "commit": null,
  "pullRequest": 123,
  "pullRequestUrl": null,
  "resolved": true,
  "reason": null
}
```

Without a linked reviewer it returns what is knowable (`resolved: false`,
`reason: "sign-in"`). Other reasons: `none`, `ambiguous`, `no-access`,
`unconfigured`. A GitHub outage is a 502. `pullRequest` and `pullRequestUrl` are
null when GitHub found the stated pull request closed, or the match ambiguous.
Key on `resolved`, not on the presence of a number.

`request.preview.label` is the raw key, not a slug or a ticket; a host that builds
a folder name from it should slug it.

With `preview` set, the session cookie's `Path` follows `basePath` instead of
`/api/maple`, unless `githubAuth.path` is set.

`github` also takes `media`, the same connector `githubStore` takes, so a pull
request comment's screenshot link goes through the host's media route:

```ts
github: { owner: "acme", repo: "shop", media },
```

Per-request `store`, `media`, `gate` and `identity` callbacks receive the
resolved session as `request.preview` (`key`, `label`, `branch`, `commit`,
`pullRequest`), so a host does not re-read headers. `/me` and `/auth/*` never
ask GitHub, so there `request.preview` is unresolved: `branch` is the branch the
deploy states, else the key, and there is no `pullRequest` unless the deploy
stated one. `/context` signed out reports the same `branch`.

## Options

`mirrord({ env, header, baggage, envNames, matches })` takes the host's env, the
header name or `false`, the baggage entry name or `false`, the env names (`key`,
`commit`, `pullRequest`, `branch`, `ref`) and the head-branch rule.
