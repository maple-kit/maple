# Example: Next

A real Next 16 application, on Turbopack, that Maple's loader builds.
`pnpm verify` builds it three times and asserts on the output.

```bash
pnpm --filter @maple-kit/example-next verify
```

## What it proves today

**The tagger runs on a preview build, in both bundles**, and
`reactRemoveProperties` strips it from both.

| Build       | Tagger | Strip | Asserts                                              |
| ----------- | ------ | ----- | ---------------------------------------------------- |
| preview     | on     | off   | `data-maple-` present in `static/` **and** `server/` |
| strip check | on     | on    | `data-maple-` absent from both                       |
| production  | off    | on    | `data-maple-` absent from both                       |

The strip-check build is why there are three rather than two. A production build
never runs the tagger, so finding it clean proves only that nothing happened.
Tagging and stripping in the same build is what exercises the stripping pass —
and a stripped client with an unstripped server is the failure that looks like
success, because the place people look is the browser.

The client component in `app/counter.tsx` exists for the same reason: an app
router application with no `"use client"` anywhere produces a client bundle
containing none of its own markup, so the client half of the assertion would
pass without testing anything.

## What it does not prove yet

1. **Mounting under a strict CSP.** The application should set
   `script-src 'nonce-…' 'strict-dynamic'` and Maple should mount anyway.
   `'strict-dynamic'` discards `'self'`, so `<Maple />` has to arrive as part of
   the application's own module graph. The overlay's components do not exist
   yet; see `docs/overlay-csp.md`.
2. **The codemod route.** `app/api/maple/[...maple]/route.ts`, written by a
   codemod and checked in here so its output is reviewed as code.
3. **Server-side identity.** A `resolveUser(request)` reading the application's
   own session cookie and stamping `provenance: "server"`.

## Notes for whoever extends it

- Next 16 renamed `middleware.ts` to `proxy.ts`. This example has neither yet.
- **Do not add `as: "*.tsx"` to the Turbopack rule.** Turbopack's `*` captures
  the whole filename including its extension, so the module is renamed
  `page.tsx.tsx` and every relative import stops resolving.
