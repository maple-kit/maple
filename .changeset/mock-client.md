---
"@maple-kit/mock": minor
---

`createMockClient()`, at the new `@maple-kit/mock/client` entry and the root,
is the mock box's controller without a framework: the calls this route has
recorded, a draft of states, Apply and Turn off, and Copy link and Copy recipe
for a page with no store. It finds the transport `installMock` put in the page
rather than importing the interceptor, so a page that shows the box without
mocking loads none of it.

**Breaking:** `Inventory` has a `subscribe(listener)` method, so an object
written to satisfy that interface needs one.
