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
in-memory store at startup by `src/app/seed.ts`, because an empty store is
both the least interesting state the overlay has and the one a first run
always lands in.

From there the loop runs end to end. Pick **Element**, **Text** or **Region**
from the island's bottom edge and click, select or drag on the page; the
composer opens on what you chose, with a screenshot of the page taken at the
moment you picked. Click a row to read a comment with its context badge.
Everything is answered by the SDK route the Vite plugin mounts on the dev
server, so nothing reaches a network.

The dev server resolves the workspace packages to their **source**, so an edit
anywhere in `packages/` hot-reloads here without a rebuild.

Two more things worth knowing: `?maple=off` turns the overlay off without a
rebuild, and the store is in memory, so restarting the server puts the three
seeded comments back and drops anything written since.

`pnpm verify` is the other half — it builds the app twice and asserts on the
output, so what this example claims is checked rather than described:

```bash
pnpm --filter @maple-kit/example-vite verify
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
   `@maple-kit/ui/maple` in `App.tsx` is the whole call site: the marks, the
   picker, the island and the composer, over one shadow root. An application
   replacing a part imports the parts instead, which is what that entry is
   assembled from.
6. **Every pick has something to say.** The page is built from named
   components — `MetricCard`, `ThroughputChart`, `ReviewTable`, `GateNotice`,
   `SettingsForm` — and two carry `data-maple-label`, so a comment reads "on
   the gate notice" rather than naming a selector.

## What it does not prove yet

The CSP contrast with the Next example: this one is not yet run under the same
policy, so `docs/overlay-csp.md`'s claim is still described rather than tested.

The route here is `memoryStore()`, mounted by the Vite plugin on the dev and
preview servers only. A statically deployed copy of this example has no server
and has to host the route elsewhere.
