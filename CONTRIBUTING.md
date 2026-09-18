# Contributing

## Getting set up

```
pnpm install
pnpm hooks
pnpm lint && pnpm typecheck && pnpm test
```

Node 22.13 or newer, pnpm 10.

`pnpm hooks` is a separate step on purpose. `.npmrc` sets `ignore-scripts=true`,
so no package — including this one — runs code at install time. That is worth
one extra command.

Browser-mode tests need Chromium once:

```
pnpm exec playwright install chromium
pnpm test:browser
```

## Sign your commits

Every commit needs a Developer Certificate of Origin sign-off:

```
git commit -s -m "fix(core): reject a non-positive list limit"
```

That adds a `Signed-off-by:` line, which certifies you wrote the change or have
the right to submit it under Apache-2.0. The full text is in [DCO](DCO). CI
checks every commit in a pull request. There is no CLA.

## Commit messages

Conventional commits, one concern per commit:

```
<type>(<scope>): <summary>

<why this change, not what the diff already shows>
```

Types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style`, `test`.

The body is where the reasoning goes. A reader six months from now has the diff
and needs the rest.

## Adding a dependency

Maple takes very few, on purpose. Before adding one:

1. If fewer than about five of its functions are needed, port them into
   `packages/core/src/lib/` with attribution and unit tests instead.
2. Otherwise check its stars, its last release, whether it is maintained and
   whether its licence is compatible with Apache-2.0.
3. **Put that reasoning in the commit body.** It is the record that survives.

`.npmrc` pins exact versions and refuses install scripts; `pnpm-workspace.yaml`
refuses anything published in the last three days.

## Adding a connector

Use the `contribute-connector` skill in `.claude/skills/`, or follow it by hand:
copy the template, implement the interface, run the shared contract suite, and
add the row to the matrix in [`docs/connectors.md`](docs/connectors.md).

A connector that cannot pass the contract suite is a connector Maple cannot use,
so that suite is the review.

## What CI checks

`lint`, `typecheck`, `format`, `test` (including browser mode), `build` with
`publint` and `attw`, `gitleaks`, and the DCO sign-off. All of them are
reproducible locally with the commands above.

Lint failures are errors, never warnings. If a rule is wrong for a case, say so
in the pull request rather than adding a suppression: the suppressions file is
frozen and CI fails on a change to it.

## Changesets

If you changed a published package:

```
pnpm changeset
```

Pick the packages, pick the bump, and write the line a user will read in the
release notes — not the commit summary.

## Reporting a security issue

Do not open an issue. See [SECURITY.md](SECURITY.md).
