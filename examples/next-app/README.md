# Example: Next

A real Next 16 application, on Turbopack, that Maple's loader builds and
Maple Mock runs in. The page is a small tRPC app whose procedures answer with
the fixed data in `server/data.ts`. `pnpm verify` builds it three times and
asserts on the output.

```bash
pnpm --filter @maple-kit/example-next verify
```

## What it proves today

**The tagger runs on a preview build, in both bundles**, and
`reactRemoveProperties` strips it from both. **Maple Mock is in a preview build
and in no other.**

| Build       | Tagger | Strip | Mock | Asserts                                                             |
| ----------- | ------ | ----- | ---- | ------------------------------------------------------------------- |
| preview     | on     | off   | on   | `data-maple-` in `static/` **and** `server/`; the mock in `static/` |
| strip check | on     | on    | off  | `data-maple-` absent from both                                      |
| production  | off    | on    | off  | `data-maple-` and the mock absent from both                         |

The strip-check build is why there are three rather than two. A production build
never runs the tagger, so finding it clean proves only that nothing happened.
Tagging and stripping in the same build is what exercises the stripping pass —
and a stripped client with an unstripped server is the failure that looks like
success, because the place people look is the browser.

The client component in `app/counter.tsx` exists for the same reason: an app
router application with no `"use client"` anywhere produces a client bundle
containing none of its own markup, so the client half of the assertion would
pass without testing anything.

**Maple Mock against a real tRPC app.** The client is set up the way
production apps set one up: superjson, `httpBatchStreamLink` for queries and
mutations, `httpSubscriptionLink` for events, at `/api/trpc`.

| Call               | What it is there for                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| `project.list`     | a page envelope with `Date`s, for every state from `empty` to `many`        |
| `project.count`    | an untouched call in the same streamed batch                                |
| `project.slow`     | answers after 1.5 s, so a mocked batch waiting for it can be timed          |
| `user.me`          | the session, in a request of its own, so `loading` elsewhere never holds it |
| `project.create`   | a mutation, which goes through unless a recipe names it                     |
| `activity.onEvent` | a subscription, a tick a second                                             |

Open the page with `?maple-mock=` set to any state on `trpc:project.list` and
the table shows it. `/api/created` says how many creates reached the server,
which is how a mocked mutation is shown never to arrive.

**Every call is made on the client.** The interceptor lives in the page, so a
server component's data never passes through it. `instrumentation-client.ts`
installs it before hydration, behind `MAPLE_MOCK`, which `next.config.ts` sets
for a preview build and `next dev` and inlines, so production drops it.

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
- **The page runs the built `@maple-kit/mock`.** The workspace tsconfig maps
  packages to source, whose `.js` specifiers Turbopack cannot map to `.ts`, so
  `next.config.ts` aliases the mock to its `dist`. Build it first.
- **Do not add `as: "*.tsx"` to the Turbopack rule.** Turbopack's `*` captures
  the whole filename including its extension, so the module is renamed
  `page.tsx.tsx` and every relative import stops resolving.
