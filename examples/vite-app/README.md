# Example: Vite

**Status:** stub. There is nothing to mount yet — the overlay in
`@maplekit/core/overlay` is a reserved entrypoint, not an implementation. This
example is built in US1, against a real overlay.

It is not a workspace package yet, deliberately: an example that pulls a build
tool into the lockfile while demonstrating nothing costs install time and
supply-chain surface for no return.

## What it has to prove

Vite is the easy target, and it is the one that shows how little setup Maple
should need.

1. **Zero-configuration mounting.** One plugin in `vite.config.ts` and nothing
   else. The plugin has every hook it needs: `configureServer` and
   `configurePreviewServer` for the SDK route, `transformIndexHtml` to mount the
   overlay. No codemod, no manual route.
2. **The same plugin does the tagger.** `maple({ tagger: mode !== "production" })`
   emits `data-maple-src` in preview and does not run the transform in
   production, so there is nothing to strip.
3. **A preview build, not a dev server.** Maple's whole premise is comments on
   deployed previews. An example that only works under `vite dev` proves the
   wrong thing; this one is exercised through `vite build && vite preview`.
4. **The CSP contrast.** Run alongside the Next example under the same policy,
   so the documentation's claim about which directives Maple needs is a test
   rather than a sentence.
