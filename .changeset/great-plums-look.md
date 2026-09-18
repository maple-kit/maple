---
"@maple-kit/core": minor
---

Add the tagger's two emitters: `@maple-kit/core/vite` and
`@maple-kit/core/loader`.

The Vite plugin is one entry in `vite.config.ts`. The loader is how Next reaches
the same transform, configured as a Turbopack rule. Both run the same Babel
plugin, so they cannot drift.

`examples/vite-app` and `examples/next-app` are real applications that assert on
their own build output, including that `reactRemoveProperties` strips
`data-maple-` from the Next **server** bundle and not only the client one.
