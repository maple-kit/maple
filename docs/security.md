# Deploying Maple in an organisation

The security model and a hardening checklist for a team putting Maple on shared
previews. It links to the design documents rather than repeating them; each
section names the file that argues the point. To report a vulnerability, see
[`SECURITY.md`](../SECURITY.md).

## The model in one paragraph

A preview is reachable by anyone with its link, is rebuilt on every push, and
runs half-finished code. So a preview holds no GitHub secret: a reviewer signs
in with Device Flow and the route keeps their own token in an `HttpOnly` cookie.
The gate's credentials stay on the server or in CI, and an agent's token stays on
a developer's machine. A stolen reviewer token can write and read pull-request
comments on the repositories the App is installed on, and nothing else
([worst case](github-auth.md#worst-case)).

## Trust boundaries

| Part               | Trusted to                                                               | Not trusted to                                                             |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Reviewer's browser | Say who they are through GitHub, and write comments as themselves.       | Choose the commit a verdict is about, or date their own resolution.        |
| Preview host       | Serve the build and run the route.                                       | Hold a GitHub secret, a client secret or the gate's private key.           |
| The SDK route      | Own the reviewer's token, the cookie key and the gate App's credentials. | Run in production. It should answer 404 there.                             |
| Store and forge    | Be the source of truth for comments, approvals and the check.            | Tell Maple which commit to publish against, except through its own `head`. |
| The agent          | Read and resolve comments with its own `GITHUB_TOKEN`.                   | Hold a gate credential. It asks the route to refresh the check.            |
| CI                 | Publish `maple/visual-review` with the workflow's `GITHUB_TOKEN`.        | Hold the gate App's key.                                                   |

The application being previewed is trusted with everything it already has.
Maple does not defend against it, and it is out of scope in
[`SECURITY.md`](../SECURITY.md).

## GitHub Apps

Register two Apps. A user-to-server token carries every permission its App
holds, so the comment App must not carry the gate's.

| App      | Permissions                                     | Authenticates as | Token lives                |
| -------- | ----------------------------------------------- | ---------------- | -------------------------- |
| Comments | `Pull requests` read and write, `Metadata` read | the reviewer     | a cookie on the preview    |
| Gate     | `Checks` read and write (optional)              | itself           | on the route or in CI only |

No `Contents` and no `Issues`. Device Flow on; "Expire user authorisation
tokens" off, which is what keeps the client secret out of the preview. The
reasoning is in [`github-auth.md`](github-auth.md#what-the-app-may-do); the
registration runbook is the
[`setup-maple-org`](../plugins/maple/skills/setup-maple-org/SKILL.md) skill, and
`maple setup app --owner=<org>` (add `--gate` for the second App) prints the
prefilled form. `maple setup verify --client-id=<Iv…>` checks Device Flow.
Install each App only on the repositories that should be reviewable.

## Where each secret lives

[`configuration.md`](configuration.md) is the table. In short:

- The comment App's client id is public. `MAPLE_COOKIE_KEY` is a secret and
  belongs on the route.
- `MAPLE_GATE_PRIVATE_KEY` is a secret, and only on the route. A workflow that
  publishes the check uses its own `GITHUB_TOKEN` with `checks: write`, and needs
  no App.
- An agent's `GITHUB_TOKEN` belongs on a developer's machine or in CI, never in a
  preview. `MAPLE_URL` lets a resolve ask the route to republish the gate, so the
  machine holds no gate credential. The MCP server refuses to start with both
  `MAPLE_URL` and `MAPLE_GATE_TOKEN`.
- There is no `MAPLE_GITHUB_CLIENT_SECRET` and no shared token in a preview. If a
  deployment has one, it has worked around the design.

## Previews only

Mount the route and the overlay in a preview build, behind `MAPLE_PREVIEW=1`, and
never unconditionally. Assert it: a request to `/api/maple/comments?branch=x`
against a production build should answer `404`
([`github-auth.md`](github-auth.md#preview-environments-only)).

## The cookie

`HttpOnly; Secure; SameSite=Lax; Path=/api/maple`, seven days. `HttpOnly` is the
control that matters against script injected into the previewed application. Set
`MAPLE_COOKIE_KEY` (32 random bytes) to encrypt it at rest; that guards against a
leaked log or proxy capture, not a compromised server. If the route is mounted
elsewhere, set `githubAuth.path` to match. Shorten `maxAgeSeconds` if seven days
is too long for a repository ([`github-auth.md`](github-auth.md#the-cookie)).

## Who can resolve and who can approve

Read from `packages/core/src/route/handler.ts`, `approvals.ts` and
`push-access.ts`.

- **Resolving a comment** has no check of its own in the route. What limits it is
  the store: with the GitHub store built from a reviewer's token, the write
  succeeds only if that token's App is installed on the repository and GitHub
  accepts it. With no identity connector, comments are recorded as "Guest".
- **Approving** needs a resolved reviewer, otherwise `401`. Only the reviewer who
  approved can withdraw it. An approval counts for one commit, and a new push
  needs a new one.
- **Refreshing the check for an agent** (`POST /gate/refresh`) needs a bearer
  token that GitHub reports as able to push to the repository, and takes a branch
  and nothing else. The answer is cached for a minute, keyed by a hash of the
  token.
- **`requireApproval` without an identity connector** lets anyone with the link
  clear a required check as "Guest". Set both, and set `require-approval: "true"`
  in the action to match ([`gate.md`](gate.md#green-is-not-the-same-as-reviewed)).

## The gate cannot be forged by a reviewer

The route takes the commit from the store's `head`, never from the browser, and
the gate App's token never reaches a reviewer or an agent. Anyone with push access
can still forge a green status under the same check name, so pin the required
check's source in the ruleset. Which App to pin depends on who publishes:
[`gate.md`](gate.md#which-app-to-pin).

## Content-Security-Policy

Mounting Maple adds nothing to `connect-src`, `script-src`, `font-src` or
`frame-src`, and asks for `img-src blob:` to preview a screenshot before it is
sent ([`overlay-csp.md`](overlay-csp.md)). Under `'strict-dynamic'`, use the
bundled `<Maple />` component so the script inherits your nonce.

## What a comment carries

A comment stores the text of what was picked (up to 300 characters) and 32
characters either side, in the store and in the reviewer's `localStorage` draft.
Text under `nav`, `header`, `aside` and `[data-maple-private]` stays out of the
surrounding context, but not out of the picked text itself. There is no
redaction hook yet ([`privacy.md`](privacy.md)). Do not point a preview at real
customer data.

## Solo mode

`maple solo` runs a bridge on `127.0.0.1` on a random port. It accepts a request
only with the right `Host`, a 32-byte token in `x-maple-solo`, compared in
constant time, and an `Origin` equal to the preview it was started for. The
token travels in the link's fragment, which is removed on arrival and never
reaches the preview's server. Solo comments never count toward the gate
([`solo.md`](solo.md)). Safari's behaviour with the loopback bridge is
unverified.

## `maple review`

The proxy relaxes the page's Content-Security-Policy on the response it serves,
and only as far as the overlay needs: a nonce or `'self'` in `script-src-elem`,
`'self'` in `connect-src`, and `blob:` in `img-src`. Your app's own server is
untouched. It is a development tool for a page you run yourself; do not expose
its port to a network ([`review.md`](review.md#the-content-security-policy)).

## If something leaks

- **One reviewer's token:** they revoke the App under Settings, Applications,
  Authorized GitHub Apps. Their cookie fails with `401` and the overlay offers to
  link again.
- **Every reviewer's tokens:** an organisation owner uninstalls the comment App
  from the repository or the organisation.
- **`MAPLE_COOKIE_KEY`:** rotate it. Cookies encrypted with the old key stop
  working and reviewers link again.
- **The gate App's key:** generate a new private key in the App's settings, delete
  the old one, and update `MAPLE_GATE_PRIVATE_KEY`.
- **An agent's `GITHUB_TOKEN`:** revoke it on GitHub and issue a new one.
- **A vulnerability in Maple:** [`SECURITY.md`](../SECURITY.md).

Rotation of the cookie key and the gate key is not described in
[`github-auth.md`](github-auth.md) today; the steps above follow from how each is
used.

## Checklist

- [ ] Two Apps registered: comments (`Pull requests` rw, `Metadata` r) and, if
      the route publishes the gate, a separate gate App (`Checks` rw).
- [ ] Device Flow on, "Expire user authorisation tokens" off, and
      `maple setup verify` passes.
- [ ] Each App installed only on the repositories that should be reviewable.
- [ ] `MAPLE_PREVIEW=1` in previews only; a production build answers `404` on
      `/api/maple/comments`, asserted in CI.
- [ ] No client secret, shared token or gate key in any preview environment.
- [ ] `MAPLE_COOKIE_KEY` set, and `githubAuth.path` matches the mount.
- [ ] The `maple/visual-review` check is required by a ruleset and pinned to the
      App that publishes it.
- [ ] `requireApproval`, the action's `require-approval` and an identity connector
      are set together, or all unset.
- [ ] Agents use their own `GITHUB_TOKEN` and `MAPLE_URL`; none holds the gate
      key.
- [ ] Your CSP allows `img-src blob:`, and previews do not hold real customer
      data.
- [ ] Reviewers know how to revoke the App, and you know who uninstalls it.
