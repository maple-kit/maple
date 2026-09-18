---
"@maple-kit/core": minor
---

Add the SDK route at `@maple-kit/core/route`.

`createMapleHandler({ store, identity })` is a web-standard handler — a
`Request` in, a `Response` out — so the same code serves a Next route handler,
a Vite middleware, Hono and a Worker. `toNodeMiddleware` adapts it for connect,
and the Vite plugin mounts it on the dev and preview servers when given a
`route` option.

The author of a comment comes from the identity connector and never from the
request body, and a connector's error message goes to the log rather than to
the browser.
