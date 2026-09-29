---
"@maple-kit/cli": minor
"@maple-kit/core": minor
"@maple-kit/ui": minor
"@maple-kit/mcp": patch
---

Add `maple review`: the overlay on a running app with nothing wired into it. It runs the app's `dev` script with the package manager its lockfile names (or attaches with `--port` or `--url`) and opens a local reverse proxy that injects the overlay into HTML, serves the SDK route itself and passes WebSockets through, so HMR keeps working. The page's Content-Security-Policy is relaxed only as far as the overlay needs (`script-src-elem`, `connect-src`, `img-src blob:`), reusing the page's nonce, and only on the proxied response. It stands down when the page already mounts Maple. With no store configured, comments go to the local file store under `.maple/<branch>/`; `MAPLE_STORE` and the forge variables choose otherwise, as for the MCP server. There is no `maple use` yet.

`@maple-kit/cli` now depends on `@maple-kit/ui`, which builds the overlay as one script (`dist/standalone.iife.js`, React bundled in). `CommentAnchor` gains an optional `locatedBy` (`tagger` or `owner-stack`), and `@maple-kit/core/anchor` gains `installSourceLocator`, `createSourceLocator` and `locateSource`, which find the file and line of an element on an untagged page from React 19's owner stack and the dev server's source map. `resolveLocalPlace` also returns the branch it keyed by. The MCP context marks an owner-stack location as one to check.

Nothing that existed changed.
