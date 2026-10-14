# Configuration

Every environment variable a host sets to run Maple, in one place, with which
of them are secrets. The SDK reads none of these itself: the route takes
options, and a host reads its own environment and passes them in. The MCP
server is the exception, below. This file
names them so that two deployments do not invent two vocabularies.

**Maple's own knobs carry `MAPLE_`. A provider's credential keeps the
provider's name.** `MAPLE_ASSIST_API_KEY` would suggest Maple issues it;
`TYPESAFE_API_KEY` says where to go when it is rejected, and matches what the
key is called everywhere else the provider is used.

## The comment App

Signs a reviewer in, and writes their comment as them.
`docs/github-auth.md` is the design; `setup-maple-org` is the runbook.

| Name                     | Secret | What it is                                                                        |
| ------------------------ | ------ | --------------------------------------------------------------------------------- |
| `MAPLE_GITHUB_CLIENT_ID` | No     | The App's **Client ID**, starting `Iv`. Public: every reviewer sees it.           |
| `MAPLE_SESSION_SECRET`   | Yes    | Required. 32+ random bytes. Seals the reviewer's cookie: unreadable, unforgeable. |
| `MAPLE_PREVIEW`          | No     | `1` in a preview, unset everywhere else. Gates the tagger and the mount.          |

There is deliberately **no client secret and no private key here**. Device
Flow's token exchange needs neither, and a deployment holding either has worked
around the whole design.

## The gate App

Publishes `maple/visual-review` when a reviewer resolves the last comment, with
no new push. `docs/gate.md` is the design.

| Name                         | Secret | What it is                                     |
| ---------------------------- | ------ | ---------------------------------------------- |
| `MAPLE_GATE_APP_ID`          | No     | The **App ID**, not the client id. A number.   |
| `MAPLE_GATE_INSTALLATION_ID` | No     | Which installation to mint a token for.        |
| `MAPLE_GATE_PRIVATE_KEY`     | Yes    | The App's `.pem`, contents rather than a path. |

**This is a second App, and that is a security decision rather than a
preference.** A user-to-server token carries every permission its App holds, so
putting `Checks` on the comment App would hand every reviewer's cookie the
power to write check runs. `docs/github-auth.md` has the argument.

**None of this is needed to run the gate in CI.** `maple-action` publishes the
check with the workflow's own `GITHUB_TOKEN` and `checks: write`, and needs no
App registered at all. These three variables buy the other half: a resolve
clearing the check live, rather than a reviewer waiting for a commit nobody
needs to make.

**On the route, `requireApproval` is an option, not a variable** (the MCP
server's `MAPLE_REQUIRE_APPROVAL`, below, is the one place it is read from the
environment). It is off by default, and when it is on the action needs
`require-approval: "true"` to match. The two publish the same
check name, so a disagreement lets a push clear a gate a reviewer is holding.
It also needs an identity connector, or anyone with the preview URL can clear a
required check as "Guest".

The installation id is on the installation's settings URL —
`https://github.com/organizations/<org>/settings/installations/<id>` — and
`gh api /app/installations` lists it once the key is in hand.

## Pins only when open

`pins` on `<Maple>` decides when the marks on the page, and the edge indicators
that point at off-screen ones, are drawn. The default, `"always"`, is today's
behaviour. `"open"` keeps the page clean until the island is opened, which is
what you want when you send someone a preview of a design.

It resolves like the viewer's other preferences, first match wins:

1. `?maple-pins=open` (or `always`) in the link, so the shared URL carries it.
2. The viewer's own choice, the **Pins only when open** switch in the island's
   settings, remembered per origin.
3. The `pins` prop.
4. `"always"`.

"Open" means the card is showing, not the collapsed pill. Three things draw
their marks even while the island is shut: a selected comment (a
`?maple-comment=` link opens the island anyway), an armed pick and an open
composer. Hiding the island from the settings also hides the marks.

## The assist tier

Scores a comment as it is typed. Off unless a classifier is configured, so
every variable here is optional. `docs/assist.md` is the design.

| Name               | Secret | What it is                                                                       |
| ------------------ | ------ | -------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY` | Yes    | The System One key `jevClassifier` authenticates with.                           |
| `MAPLE_AI_MODEL`   | No     | An alias or a pinned version. Defaults to `jev-latest`.                          |
| `MAPLE_AI_API`     | No     | The API root, for a request-compatible reimplementation. Defaults to TypeSafe's. |

**The key is read on the server and reaches the browser through nothing.** The
route holds the classifier; `/assist` is same-origin, which is also what keeps
`connect-src` unchanged.

Absent a key, drop the `assist` option and the tier is simply off — or pass
`keywordClassifier()`, which needs no network and is the floor the evals
measure against.

## The agent loop

The MCP server is the one place Maple reads its own environment, because it is
a process rather than a library. `docs/agent-loop.md` covers it.

<!-- generated:mcp-environment -->

| Name                     | Secret | What it is                                                                                                           |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`           | Yes    | A token that can read and write pull-request comments. Required for the `github` store.                              |
| `MAPLE_GITHUB_OWNER`     | No     | The repository's owner. Required for the `github` store.                                                             |
| `MAPLE_GITHUB_REPO`      | No     | The repository. Required for the `github` store.                                                                     |
| `MAPLE_GITHUB_API`       | No     | The API root, for Enterprise Server.                                                                                 |
| `MAPLE_STORE`            | No     | `github`, the default when a forge is configured, or `file`, the default when none is: the comments under `.maple/`. |
| `MAPLE_BRANCH`           | No     | The branch the Stop hook checks, else the one checked out. The server ignores it.                                    |
| `MAPLE_URL`              | No     | The deployed route's mount URL. A resolve asks it to republish the gate.                                             |
| `MAPLE_GATE_TOKEN`       | Yes    | For CI only: the gate App's installation token. Not with `MAPLE_URL`.                                                |
| `MAPLE_GATE_APP_ID`      | No     | The gate App's id, so it updates its own check run rather than another's.                                            |
| `MAPLE_REQUIRE_APPROVAL` | No     | `true` to hold the gate until somebody approves, matching the route and CI.                                          |

<!-- /generated:mcp-environment -->

`maple review` reads `MAPLE_STORE`, `MAPLE_GITHUB_OWNER` and `MAPLE_GITHUB_REPO` like this (not `GITHUB_TOKEN` alone), and
uses the local files when none is set (`docs/review.md`).

This token is an agent's, not a reviewer's, and it belongs on a developer's
machine or in CI — never in a preview environment.

On a developer machine, set `MAPLE_URL` and leave `MAPLE_GATE_TOKEN` unset: a
resolve asks the route to republish the gate, and the gate App's credentials
stay on the route. `MAPLE_GATE_TOKEN` is for CI, where a job lasts less than the
hour an installation token lives. The server refuses to start with both.

## CI: the Vite example's preview

`.github/workflows/vite-app-preview.yml` deploys `examples/vite-app` as one
Cloudflare Worker per pull request. These are repository settings, not Worker
configuration; the Worker's own variables are set by the workflow.

| Name                     | Secret | Kind     | What it is                                                                                                                                                |
| ------------------------ | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`   | Yes    | Secret   | An API token: Workers Scripts: Edit on the account, Workers Routes: Edit and DNS: Edit on the `maple-kit.org` zone. Never runs for a fork's pull request. |
| `CLOUDFLARE_ACCOUNT_ID`  | No     | Variable | The account the Workers belong to.                                                                                                                        |
| `MAPLE_GITHUB_CLIENT_ID` | No     | Variable | The comment App's client id, passed to the Worker as the variable of the same name.                                                                       |

The Worker is served at `<branch>.preview.maple-kit.org`, a Workers Custom
Domain, so the zone must be on the same account as `CLOUDFLARE_ACCOUNT_ID`.

The Worker also receives `MAPLE_REPO`, `MAPLE_COMMIT` and `MAPLE_PR` from the
workflow, so its store is the pull request the build came from.

### Screenshots

Every preview Worker binds one R2 bucket, `maple-example-previews`, as
`SCREENSHOTS` and writes under `pr-<number>/` (`r2Media` in
`@maple-kit/core/connectors`). Create it once, with an account login that can
manage R2, and add the lifecycle rule that expires what a closed pull request
leaves behind:

```bash
wrangler r2 bucket create maple-example-previews
wrangler r2 bucket lifecycle add maple-example-previews expire-previews pr- --expire-days 14
```

The deploy token needs **Workers R2 Storage: Edit** (account permission) to bind
the bucket. A pull request's screenshots are not deleted when it closes, since
wrangler cannot delete by prefix; they expire 14 days after upload, within
about a day of that. Free tier: 10 GB-month of storage, 1 million writes and 10
million reads a month, and no egress charge
(<https://developers.cloudflare.com/r2/pricing/>).

A screenshot link is public and unguessable: the key is 128 random bits, and
GitHub's image proxy has to load it with no cookie. Uploading needs a signed-in
reviewer.

To let a resolve on the preview clear `maple/visual-review` itself, register
the gate App (the section above) with **Checks: Read and write** and nothing
else, install it on this repository, and set:

| Name                         | Secret | Kind     | What it is                                                                                    |
| ---------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------- |
| `MAPLE_GATE_APP_ID`          | No     | Variable | The gate App's **App ID**, passed to the Worker as the variable of the same name.             |
| `MAPLE_GATE_INSTALLATION_ID` | No     | Variable | The installation on this repository, passed the same way.                                     |
| `MAPLE_GATE_PRIVATE_KEY`     | Yes    | Secret   | The App's `.pem` as GitHub gave it (PKCS#1 is fine), put on the Worker as a secret, on stdin. |

`MAPLE_SESSION_SECRET` is a repository secret too, put on the Worker the same
way; the deploy fails without it, because a preview that cannot sign anyone in
is not a preview.

Without all three the Worker runs with no gate, exactly as before. The key
reaches only the deploy step of a same-repository pull request; the trigger is
`pull_request`, so a fork never has it. The Worker is public, so a key held
there is a decision: keep the App to `Checks` alone, as `docs/github-auth.md`
argues, and nothing else is reachable with it.

## A web application firewall in front of the route

A firewall rule on request body size can reject Maple's requests before they
reach the route. AWS WAF's managed Common Rule Set, for one, blocks a body over
8 KB (`SizeRestrictions_BODY`), and the load balancer answers 403 with an HTML
page. Two routes carry bodies that large:

- `POST {base}/mock/plan` sends a summary of every call a page recorded. Maple
  keeps each request under about 6 KB on the wire by gzipping it and splitting
  it into batches, so it passes the default rule, but a stricter one can still
  block it.
- `POST {base}/media` uploads a screenshot, which is far larger than any rule.

Exempt the route's path from the body-size rule, or mount the route under a
prefix the firewall already exempts, using `basePath` on both the route
(`createMapleHandler({ basePath })`), the overlay and `installMock({ route })`.
A blocked plan shows in
the mock box as "The server refused that", and in the host's logger as a
warning with the status.

## Flags the server read

A server-rendered page and its API calls read flags on the server, where the
browser cannot see which. Report them in a response header and the mock box
lists them, tagged "server", beside the flags the page read itself. A mocked
value reaches the server through the `maple-mock` cookie, so it applies after a
reload.

Wrap the handlers, or have the one flag helper call `recordFlagUse`:

```ts
import { recordFlagUse, withFlagUse } from "@maple-kit/core/flags";

export const GET = withFlagUse(async (request: Request) => {
  if (await isEnabled("new-roaster")) recordFlagUse("new-roaster");
  return Response.json(await roasters());
});
```

`withFlagUse` sets `x-maple-flags: <key>,<key>` on the response: comma-separated,
URL-encoded keys, in the order read, capped at 4 KB with keys that do not fit
dropped. A request has its own collector (`AsyncLocalStorage`), so concurrent
requests never share keys. Collection is on only when the Maple route was
created with `mock: { preview: true }`; otherwise `recordFlagUse` does nothing
and no header is written. A flag read after the handler returns, such as while
a body streams, is not seen. The mock interceptor reads the header on each
intercepted response and records the keys as used on the page's route. The
document request is invisible to it, so emit the header on the data requests
that follow (route handlers, RSC and `fetch` calls), which `withFlagUse` does.

`@maple-kit/core/flags` is Node only. For LaunchDarkly's Node server SDK,
`@maple-kit/core/launchdarkly` has a structural `afterEvaluation` hook, so no
helper changes:

```ts
import { launchDarklyFlagUse } from "@maple-kit/core/launchdarkly";

init(sdkKey, { hooks: [launchDarklyFlagUse()] });
```

## Where each one goes

A secret goes wherever that deployment keeps secrets, and the rest can sit in
plain configuration checked into a repository. On Kubernetes that is the split
between a `Secret` and a `ConfigMap`; on a platform host it is the "sensitive"
checkbox. The table above is the whole answer to which is which.

Nothing in the non-secret column becomes a secret by being kept private. A
client id is in every authorisation URL and an App ID is on the App's public
page; treating them as secrets costs a rotation procedure and buys nothing.
