# Solo mode: a guest's comments on their own machine

On a deployed preview, a reviewer who cannot sign in is a guest. A guest writes
drafts, and drafts live in one browser for a week (`docs/drafts.md`). When the
guest is also the person running the agent, the comments can go straight to
their machine instead, as real comments in `.maple/<branch>/` that the MCP
server reads.

That is solo mode. It is for **the person running the agent**, on the machine
running it. It is not a way to review with somebody else.

## The handoff

1. In the repository the agent works in, run `maple solo <preview-url>`, or have
   the agent call the `start_solo` MCP tool with the same address.
2. Either starts a **bridge**: an HTTP server on `127.0.0.1`, on a free port, in
   front of `fileStore()` and `fileMedia()` from `@maple-kit/core/local`. It
   mounts the SDK route (`createMapleHandler`) rather than restating its
   endpoints, so the overlay talks to it exactly as it talks to a deployment.
3. It prints `<preview-url>#maple-solo=<token>&maple-bridge=<address>`. The
   second key is there because the port is random; the overlay refuses any
   bridge that is not `http://127.0.0.1`, `http://localhost` or `http://[::1]`
   with a port, so a crafted link cannot point comments at another host.
4. The reviewer opens the link. The overlay reads `location.hash` when its
   script first runs, removes the two keys with `history.replaceState` (no new
   history entry; any other fragment the host uses is kept), and stores the
   pairing in `localStorage` for that preview's origin.
5. From then on comments and screenshots are posted to the bridge. The
   island's state carries `solo: true`, and the overlay sends no request to
   the preview's own route for comments.

`maple solo` stays in the foreground until Ctrl-C. The MCP tool keeps one bridge
per preview origin for the life of the server and returns the same link if asked
again. `start_solo` refuses when the server is reading a forge, because
solo comments are written to `.maple/` and that server would never list them:
set `MAPLE_STORE=file`.

## Why a fragment, and why `localStorage`

**Not a query string.** A query goes to the preview server on the request and
into its access logs, and often into analytics and referrers. The fragment is
never sent to the server, so the token stays off every machine but the two that
need it.

**Not a cookie.** A cookie the page can read is a cookie the browser sends to
the preview server on every request. `localStorage` is readable by the page and
by nothing on the wire.

**Read early, then removed.** A host application's router may rewrite the URL
before the overlay mounts, so the client reads the fragment as its script is
evaluated and again when a controller is built. Removing it keeps the token out
of a copied address, a screenshot of the address bar, and the browser history.
A client-side navigation afterwards has nothing to lose: the pairing is in
storage, and the running controller holds it.

**Behind the same guard as drafts and preferences.** `localStorage` throws on
access in a private window and where site data is blocked. There the pairing
lasts the page (held in memory) and the address bar is still cleaned.

## What the bridge accepts

Everything else is refused before the route sees it. A request is served only
when **all** hold:

- it is addressed to `127.0.0.1:<port>` or `localhost:<port>` (a `Host` that
  names anything else is a DNS-rebinding attempt: 403);
- it carries the token, in the `x-maple-solo` header (401 otherwise), compared
  in constant time;
- its `Origin` is exactly the origin the bridge was started for (403).

CORS answers for that one origin and no other, and a refusal carries no CORS
headers, so a page that is not paired cannot read even the refusal. A
preflight is answered only for the paired origin (it cannot carry the token, and
the answer grants nothing). It also opts in to Chrome's private network access
with `Access-Control-Allow-Private-Network`.

One exception: a screenshot is shown in an `img`, which cannot send a header. A
`GET` of `/media/<key>` may carry the token as `maple-solo=` in its query, and
because an `img` request sends no `Origin`, the origin is taken from the
`Referer` instead. A host page with `Referrer-Policy: no-referrer` therefore
shows no solo screenshots; the comments still work.

The token is 32 random bytes, in the link only, and dies with the bridge.

## What an unpaired overlay does

It never probes localhost. In Chrome, every request from a public page to
`127.0.0.1` raises the local-network permission prompt, and a prompt on a page
that never asked for solo mode is a bug. An unpaired guest sees one link, inside
the sign-in popup: "Can't sign in?" opens a second popup that says to run
`maple solo` to keep comments on your machine, where the command copies as
`maple solo <this page's origin>`.

A paired page whose bridge has gone says so, and offers **Leave solo**, which
forgets the pairing and returns to the host's own route.

## Safari

Chrome and Firefox treat `http://127.0.0.1` as a potentially trustworthy
origin, so an https page may fetch it. Safari has been reported to treat
loopback http as mixed content and block the request from an https page (WebKit
bug 284559 is one report; others describe "XMLHttpRequest cannot load
http://127.0.0.1 … due to access control checks").

**This is unverified here.** The repository's browser tests run in Chromium only,
and no Safari was available to test against, so what Safari does today is
documented from those reports and not observed. If it blocks, the guest sees
the solo notice ("did not answer") and **Leave solo**, and drafts continue to
work as before. The remedies are outside this change: review in Chrome or
Firefox, or serve the bridge over https with a locally trusted certificate,
which needs a dependency-free way to mint and trust one and is left for later.

## Why solo cannot gate a merge

`maple/visual-review` is decided by CI from the store a forge holds. CI cannot
read a laptop, and a check that depended on `.maple/` would pass on whatever the
machine running it chose to write. So solo comments never count toward the
check, whoever wrote them and whatever their status. A reviewer who wants the
gate to see a comment signs in and publishes it. Promoting solo comments to a
pull request once the reviewer can sign in is not built.

## Where it lives

| Piece                             | Where                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| The bridge and its gate           | `packages/core/src/local/bridge.ts`                        |
| Pairing: link, capture, storage   | `packages/core/src/client/solo.ts`                         |
| The overlay's calls to the bridge | `packages/core/src/client/transport.ts` (`solo` option)    |
| `maple solo`                      | `packages/cli/src/commands/solo.ts`                        |
| `start_solo`                      | `packages/mcp/src/solo.ts`, `packages/mcp/src/handlers.ts` |
| The one line, and the way back    | `packages/ui/src/solo.ts`                                  |
