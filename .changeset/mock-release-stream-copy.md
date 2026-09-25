---
"@maple-kit/mock": patch
---

A page can close a stream the interceptor let through. The interceptor's copy
of a response it did not read, such as a server-sent event stream read over
`fetch` or `XMLHttpRequest`, is now cancelled. Before, the page's own `cancel()`
never settled, and the server kept the stream open for as long as it ran.
