---
"@maple-kit/mock": minor
---

**`@maple-kit/mock` rewrites REST responses in the page.**

`import "@maple-kit/mock/install"` wraps `fetch` and `XMLHttpRequest` over
`@mswjs/interceptors`, with no service worker. `installMock(options)` is the
same with a logger and an `ignore`. The active recipe is read once at install,
from `?maple-mock=` or the tab.

A call the recipe names is answered in its state and every other call keeps
the server's answer. `empty`, `one` and `many` reshape the server's own JSON,
keeping envelope keys, and fall back to the last recorded answer when the
server fails. `error` and `forbidden` answer 500 and 403 without sending the
request, and `loading` holds it.

Also exported: `resolve`, `restCodec`, `restKey`, `pathPattern`, `reshape`,
`createInventory`, and the `Codec` contract.
