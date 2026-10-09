---
"@maple-kit/core": patch
---

`readCookie` treats a comma as a pair separator. Over HTTP/2 and HTTP/3 a browser may send cookies as several headers, which `Headers` joins with ", ", so the GitHub sign-in's pending and session cookies were read with the next cookie attached, or not at all: sign-in had to be retried, and a signed-in reviewer's store calls failed.
