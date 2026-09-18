# Example: Vite

A real Vite 8 + React 19 application that Maple's plugin builds. `pnpm verify`
builds it twice and asserts on the output, so what this example claims is
checked rather than described.

```bash
pnpm --filter @maple-kit/example-vite verify
```

## What it proves today

1. **One plugin, no other configuration.** `maple({ tagger })` in
   `vite.config.ts` is the whole setup.
2. **The tagger runs on a preview build.** The bundle carries `data-maple-src`,
   `data-maple-name`, and the repository-relative source path.
3. **A production build carries nothing.** No `data-maple-` attribute and no
   source path anywhere in the output. Vite needs no stripping pass for this:
   the plugin simply does not run the transform, so there is nothing to strip.
4. **A build, not a dev server.** Maple's premise is comments on deployed
   previews, so the assertions run against `vite build` output.

## What it does not prove yet

Mounting the overlay, and the CSP contrast with the Next example. The overlay's
components do not exist yet — `@maple-kit/core/overlay` currently holds the
context badge, the draft store and the stylesheet constraint, not a UI. When
they land, this example gains `transformIndexHtml` mounting and is run under the
same policy as the Next one, so `docs/overlay-csp.md`'s claim becomes a test.
