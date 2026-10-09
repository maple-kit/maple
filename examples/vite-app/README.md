# Example: Vite

A real Vite 8 + React 19 application that Maple's plugin builds, and the
fastest way to see the whole reviewer interface working.

```bash
nvm use
pnpm install
pnpm --filter @maple-kit/example-vite dev   # http://localhost:5173
```

Open it and there are already three comments on the page: a leaf mark on each,
a pill reading `3 open`, and rows in the island. They are seeded into the
store the first time it starts, by `src/app/seed.ts`, because an empty store is
both the least interesting state the overlay has and the one a first run
always lands in.

From there the loop runs end to end. Pick **Element**, **Text** or **Region**
from the island's bottom edge and click, select or drag on the page; the
composer opens on what you chose, with a screenshot of the page taken at the
moment you picked. Click a row to read a comment with its context badge.
Everything is answered by the SDK route the Vite plugin mounts on the dev
server, so nothing reaches a network.

The page resolves the workspace packages to their **source**, so an edit to
what runs in the browser hot-reloads here without a rebuild. `vite.config.ts`
is the exception: it runs in Node and imports `@maple-kit/core` and
`@maple-kit/classifier` from their `dist`, which `predev` builds before the
server starts. After a change to the plugin, the route or a classifier, stop
the server and run `dev` again so `predev` rebuilds it.

Two more things worth knowing: `?maple=off` turns the overlay off without a
rebuild, and the store is `fileStore()`, so comments and screenshots are files
under `.maple/<branch>/` at the repository's main checkout and survive a
restart. Delete that folder to get the three seeded comments back.

`pnpm verify` is the other half — it builds the app twice and asserts on the
output, so what this example claims is checked rather than described:

```bash
pnpm --filter @maple-kit/example-vite verify
```

## A public preview for every pull request

A pull request that touches `packages/` or this example gets a deployed copy,
so a reviewer can comment on it without running anything.
`.github/workflows/vite-app-preview.yml` builds with `MAPLE_PREVIEW=1`, so the
tagger is on and every comment carries `file:line`, then deploys one
Cloudflare Worker named `maple-example-pr-<number>` on a custom domain,
`<branch>.preview.maple-kit.org`, and posts the URL in a sticky comment. The
branch is lowercased into a DNS label, with a short hash when it has to be
cut to 63 characters. The Worker and its domain are deleted when the pull
request closes. A fork's
pull request is skipped: it gets no secrets to deploy with.

`worker/index.ts` is the whole server. `dist-preview/` is served as Workers
static assets, `/api/maple/*` goes to `createMapleHandler`, and the page's own
API comes from `src/app/example-api.ts`, the same table the Vite servers use.

The store is `githubStore` on this repository's own pull request, found by the
commit the build came from, and written as the reviewer: they sign in with
Device Flow on the page, and their token lives in an `HttpOnly` cookie. The
example therefore reviews the change that deployed it. The seeded comments are
for the local dev server only; a deployed copy starts with the pull request's
own ledger.

The settings the workflow needs are listed in `docs/configuration.md`. To build
and inspect the Worker without deploying it:

```bash
MAPLE_PREVIEW=1 pnpm --filter @maple-kit/example-vite build
cd examples/vite-app && pnpm dlx wrangler@4.147.0 deploy --dry-run --outdir wout
```

## What it proves today

1. **One plugin, no other configuration.** `maple({ tagger })` in
   `vite.config.ts` is the whole setup.
2. **The tagger runs on a preview build.** The bundle carries `data-maple-src`,
   `data-maple-name`, and the repository-relative source path.
3. **A production build carries nothing the tagger emitted.** No tagged
   element and no source path anywhere in the output. Vite needs no stripping
   pass for this: the plugin simply does not run the transform, so there is
   nothing to strip. The bare attribute _names_ are in both bundles now that
   the overlay ships — the anchor reads them — so the assertion is on the
   emitted prop, not the string.
4. **A build, not a dev server.** Maple's premise is comments on deployed
   previews, so the assertions run against `vite build` output.
5. **The overlay mounts, from one element.** `<Maple branch="…" />` from
   `@maple-kit/ui/maple` in `main.tsx` is the whole call site: the marks, the
   picker, the island and the composer, over one shadow root. An application
   replacing a part imports the parts instead, which is what that entry is
   assembled from.
6. **Every pick has something to say.** The page is built from named
   components — `MetricCard`, `ThroughputChart`, `ReviewTable`, `GateNotice`,
   `SettingsForm` — and two carry `data-maple-label`, so a comment reads "on
   the gate notice" rather than naming a selector.

7. **Maple Mock, with and without the overlay.** Press `m` on either page to
   open the box, pick a state beside a call, and Apply: the page reloads into
   it under a banner that only Turn off removes. `/mock.html` is the same page
   with `<MapleMock />` and no `<Maple />`, and `verify` checks it carries none
   of the island, the composer or the marks, and that a production build
   carries no interceptor even with `<Maple />` mounted.
8. **Flags and who the page is shown as.** The session carries a `role` and
   `permissions` whose words come from `openapi.json`, and `vite.config.ts`
   declares the identity rules: the audit log is owners only. The box's
   second panel picks a role, grants or takes away a permission, and flips
   `merge-forecast`, a flag LaunchDarkly's own browser SDK reads from a fake
   poll at `/ld`. As a guest, Invite and Save disappear and the audit log shows
   its own 403; the banner says the server still acts as you, and counts a
   Save that reached it. A production build ignores the same link, and
   `verify` checks it carries no flag source.

## What it does not prove yet

The CSP contrast with the Next example: this one is not yet run under the same
policy, so `docs/overlay-csp.md`'s claim is still described rather than tested.

The route in `vite.config.ts` is `fileStore()` and `fileMedia()`, mounted by the
Vite plugin on the dev and preview servers only. A statically deployed copy has
no server, which is why the pull request preview hosts the route in a Worker.
That Worker has no media connector yet, so a deployed copy cannot keep a
screenshot, and it sets no rate limit beyond GitHub's own.
