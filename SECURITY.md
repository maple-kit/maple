# Security policy

## Reporting a vulnerability

Do not open a public issue.

Report privately through GitHub's
[private vulnerability reporting](https://github.com/maple-kit/maple/security/advisories/new)
on this repository. That opens a channel visible only to the maintainers.

### What to include

- The version (or commit) and the packages involved.
- What an attacker gains, and what they need to start with.
- The smallest reproduction you have. A report without a working exploit is
  still worth sending.
- Whether you plan to publish, and by when.

If you act in good faith, keep to your own accounts and test data, and give us
a chance to fix the problem before disclosure, we will not pursue or support
legal action against you for the research.

### What happens next

You will get an acknowledgement within three working days and an assessment
within ten. If a fix is needed, we will agree a disclosure date with you before
publishing.

A confirmed issue is fixed in a private branch, released, and then published as
a GitHub Security Advisory, with a CVE where one applies. We credit the reporter
in the advisory unless you ask us not to. There is no bug bounty.

## Scope

Maple mounts inside other people's applications and reads their session cookies
to identify reviewers, so the things worth looking hardest at are:

- Anything that lets the overlay read or exfiltrate host application data beyond
  the comment it is attached to.
- Anything that lets a comment's content execute in the host page.
- Anything that lets a caller without push access flip the
  `maple/visual-review` check run, or otherwise forge a passing gate.
- Anything that leaks a server-side credential — a store's API key, the GitHub
  App private key — into a client bundle or into a comment payload.
- Anything in the SDK route that can be made to act as a proxy for a request the
  caller could not make themselves.

### Not a vulnerability

These are reports we will close, because the behaviour is by design or outside
what Maple can defend:

- A malicious or compromised host application, connector, classifier or build
  plugin. Maple runs with the trust of the code that mounts it.
- A compromised deployment environment, CI runner or developer machine, including
  a leaked secret that was placed there.
- A reviewer who already has push access to the repository doing what push
  access allows, such as moving `maple/visual-review` by pushing.
- Denial of service that needs no amplification, such as sending many requests to
  a preview.
- Findings that need a configuration the documentation warns against: mounting
  the route in a production build, setting `MAPLE_GITHUB_CLIENT_SECRET` or a
  shared token in a preview, or running `requireApproval` with no identity
  connector.
- Page text a comment carries. [`docs/privacy.md`](docs/privacy.md) says what is
  recorded and how to keep text out.
- Missing hardening on a reviewer's own browser or GitHub account.

## Security model

Maple assumes a preview is reachable by anyone holding its link, that the
application under review may be half-finished code, and that the store and the
forge are the source of truth. Each credential is held by the smallest part that
needs it, and a reviewer's token is bounded by the comment App's two
permissions. [`docs/security.md`](docs/security.md) lists the trust boundaries
and a checklist for deploying Maple in an organisation.

## Supply chain

What this repository enforces today:

- **Trusted publishing with provenance.** Releases go out from
  `.github/workflows/release.yml` by OIDC, with `provenance=true` in `.npmrc`; no
  publish credential is stored. See [`docs/releasing.md`](docs/releasing.md).
- **Exact versions.** `.npmrc` sets `save-exact=true`, and the lockfile is
  checked for stray registry URLs.
- **A three-day wait.** `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320`, so
  a version published in the last three days is not installed. Two Effect
  packages are excepted there, with the reason.
- **No install scripts.** `.npmrc` sets `ignore-scripts=true`, and
  `onlyBuiltDependencies` is empty.
- **Secret scanning.** gitleaks runs as a pre-commit hook (`lefthook.yml`) and
  as a CI job over the full history.
- **Signed-off commits.** A commit-msg hook and a CI job require a
  [DCO](DCO) sign-off on every commit.

## Supported versions

Pre-release. Until a 1.0, only the latest published version is supported.
