# `maple review`

The overlay on a running app, with nothing wired into it. Wiring the tagger,
the SDK route and the mount (`docs/configuration.md`) is the right shape for a
deployed preview and too much for "show me this on my app".

```
maple review                     # runs the dev script, opens the proxy
maple review --port 5173         # attaches to an app already running
maple review --url http://localhost:3000
```

## What it does

1. **Starts the app**, unless `--port` or `--url` says it is running. It runs
   the `dev` script (or `--script <name>`) with the package manager the nearest
   lockfile names, and reads the first local address the script prints.
2. **Opens a reverse proxy** on its own port and opens that in the browser. The
   proxy owns two paths and forwards everything else to the app unchanged:
   - `/__maple/overlay.js`, the overlay as one script with React bundled in
     (`@maple-kit/ui`'s `dist/standalone.iife.js`);
   - `/__maple/api`, the SDK route, so the app gains no route and no dependency.
3. **Injects one script tag** before `</body>` of every HTML response, and
   nothing else about the page. The tag carries the branch, the route's path and
   the repository root as `data-` attributes.
4. **Passes WebSockets through** as a TCP tunnel with the host and origin
   rewritten, which is what keeps HMR working. The proxy never reads a frame.

Redirects to the app's own address are pointed back at the proxy, and requests
are sent to the app addressed as itself (`Host`, `Origin`, `Referer`) so its
host checks pass. Responses are requested uncompressed, so HTML can be edited.

## The Content-Security-Policy

The proxy relaxes a page's policy only as far as the overlay needs, and only on
the response it serves. The app's own server is never touched. Three directives
can change, each only when the policy would otherwise block the overlay:

| Directive                             | Change                                                                                        | Why                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `script-src-elem` (else `script-src`) | reuse the policy's nonce; add a fresh one under `strict-dynamic` with none; else add `'self'` | the tag has to run                                    |
| `connect-src` (else `default-src`)    | add `'self'`                                                                                  | the overlay calls the proxy's own origin              |
| `img-src` (else `default-src`)        | add `blob:`                                                                                   | a screenshot is previewed from a blob before it sends |

`strict-dynamic` discards `'self'`, so under it only a nonce helps, and the
tag reuses the page's own nonce rather than adding a second one to a policy that
has one. The change is written to `script-src-elem` rather than `script-src`, so
inline-script and eval rules are untouched. A policy in a `<meta>` tag is
relaxed the same way. A policy that needs nothing is passed byte for byte, and
`Content-Security-Policy-Report-Only` is left alone.

## Where comments go

Whatever the environment names (`MAPLE_STORE`, or `MAPLE_GITHUB_OWNER` and
`MAPLE_GITHUB_REPO` with `GITHUB_TOKEN`), read the way the MCP server reads it
except that `GITHUB_TOKEN` alone counts for nothing, since most laptops have
one. **The local file store when nothing is named**: comments land in
`.maple/<branch>/` at the main checkout, so a first run needs no account. The
SQLite store is for a shared server and is never the default. There is no
`maple use` command yet; when one exists it replaces the environment here.

## Anchoring without the tagger

No build step means no `data-maple-src`, so the cascade starts at the `quote`
and `selector` rungs (`pageIsTagged` reports that). Two more ways to recover a
`file:line` were designed, in order:

1. **The owner stack, read through the source map.** A development build of
   React 19 keeps the stack that created each fiber, and the dev server serves a
   source map per module. The overlay resolves the picked element's frame
   through it (`@maple-kit/core/anchor`'s `installSourceLocator`), climbing
   owners past a library to the application's own code. **Proven** on React 19
   with Vite, in Chromium (`packages/ui/test/locate.browser.test.ts`). The
   reader also handles external maps and the Turbopack and webpack source
   schemes, and those are covered by unit tests only: run against a real Next
   app before relying on it there.
2. **The classifier picks from candidates.** Not built. It needs the candidate
   list (from source maps, then a repository search) and the way #128 names a
   target, and is its own piece of work.

The anchor records which rung produced its location, in `locatedBy`: `tagger`
or `owner-stack`. It is absent when nothing did. The MCP server's comment
context marks an owner-stack location as one to check.

## It stands down

If the page already mounts Maple (an `[data-maple-overlay]` element is there
once the app's own scripts have run), the script adds nothing and only sets
`data-maple-review="stood-down"` on the root element. Otherwise it sets
`mounted`.

## Not in scope

Proxying a deployed preview (that is what the mount is for), and writing to the
app's source.
