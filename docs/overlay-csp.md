# The overlay and Content-Security-Policy

Maple's claim is that mounting it adds no CSP directives. That claim is precise,
and this file is what makes it checkable.

## What is true

`connect-src` needs nothing new. The overlay talks to the SDK route on the
application's own origin, so a policy that already allows the application to
call itself already allows Maple.

## What is not true, and what Maple does about it

### `script-src 'nonce-…' 'strict-dynamic'` ignores `'self'`

Under the policy Next's own guide recommends, a same-origin
`<script src="/api/maple/overlay.js">` is blocked. `'strict-dynamic'` discards
host-source expressions, so being same-origin buys nothing.

**Maple ships `<Maple />` as a bundled component.** It is part of the
application's own module graph, so it inherits the nonce the application already
sets. A `nonce` prop stays available for hosts that mount via a script tag.

### Shadow DOM does not bypass CSP

An injected `<style>` element inside a shadow root is still an inline style and
still needs `style-src 'unsafe-inline'`.

**Maple styles only through `new CSSStyleSheet()` and `adoptedStyleSheets`.**
CSSOM string APIs are not CSP-checked. Positions are pinned with
`style.setProperty()`, never by assigning `cssText`.

`createOverlayStyleSheet` in `@maplekit/core/overlay` is the only way styles
enter the overlay, which keeps the rule enforceable by reading one function.

### Blob workers die under `strict-dynamic`

**No workers in v1.** Screenshots are compressed on the server.

### `frame-ancestors` belongs to the framed application

An offline `.maple` file cannot iframe a live preview: `frame-ancestors` will
not name a `file://` origin, and SameSite cookies are not sent to one either.

**The `.maple` file stays offline** — a screenshot with pins on it. Live framed
views are served from a same-origin viewer route, which works once the
application sets `frame-ancestors 'self'`.

## The one honest residual

`img-src blob:`, for previewing a screenshot before it uploads. It is the only
directive Maple asks for, and it is asked for in the documentation rather than
discovered in a console error.

## The claim, stated exactly

> Maple requires no additions to `connect-src`, `script-src`, `font-src` or
> `frame-src`. It asks for `img-src blob:`.

Anything that would break that sentence is a design change, not an
implementation detail.
