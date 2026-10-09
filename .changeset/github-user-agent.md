---
"@maple-kit/core": patch
---

Every request to GitHub carries a `User-Agent` header. Node's `fetch` adds one and Cloudflare Workers' does not, so on a Worker GitHub answered each store call with a 403 ("Request forbidden by administrative rules"), which the route reported as a 400.
