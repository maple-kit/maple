# Security policy

## Reporting a vulnerability

Do not open a public issue.

Report privately through GitHub's
[private vulnerability reporting](https://github.com/maple-kit/maple/security/advisories/new)
on this repository. That opens a channel visible only to the maintainers.

Please include what you can: the version, what an attacker gains, and the
smallest reproduction you have. A report without a working exploit is still
worth sending.

You will get an acknowledgement within three working days and an assessment
within ten. If a fix is needed, we will agree a disclosure date with you before
publishing.

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

## Supported versions

Pre-release. Until a 1.0, only the latest published version is supported.
