# Example: Next

**Status:** stub. There is nothing to mount yet — the overlay in
`@maplekit/core/overlay` is a reserved entrypoint, not an implementation. This
example is built in US1, against a real overlay.

It is not a workspace package yet, deliberately: an example that pulls a
framework into the lockfile while demonstrating nothing costs install time and
supply-chain surface for no return.

## What it has to prove

This is the hard target, and the reason it exists at all.

1. **Mounting under a strict CSP.** The application sets
   `script-src 'nonce-…' 'strict-dynamic'` — the policy Next's own guide
   recommends — and Maple mounts anyway. `'strict-dynamic'` discards `'self'`,
   so a same-origin script tag is blocked; `<Maple />` has to arrive as part of
   the application's module graph and inherit its nonce. See
   `docs/overlay-csp.md`.
2. **The codemod route.** Next has no plugin API that can add a route, so Maple
   ships a codemod that writes `app/api/maple/[...maple]/route.ts`. The example
   is where the codemod's output is checked in and reviewed as code.
3. **The tagger, on in preview and off in production.** Built with
   `MAPLE_PREVIEW=1`, elements carry `data-maple-src`. Built without it, a grep
   of the output finds no `data-maple-` attribute anywhere. See
   `docs/tagger.md`.
4. **Server-side identity.** A `resolveUser(request)` that reads the
   application's own session cookie, stamping `provenance: "server"`.

## Notes for whoever builds it

- Next 16 renamed `middleware.ts` to `proxy.ts`. Check which is current before
  writing the file.
- Confirm `reactRemoveProperties` runs over the server bundle and not only the
  client bundle. A stripped client and an unstripped server is the failure that
  looks like success.
