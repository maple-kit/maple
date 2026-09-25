---
"@maple-kit/core": minor
"@maple-kit/mcp": minor
---

A recipe gains two layers beside `calls`: `flags`, flag keys answered with any
JSON value, and `as`, who the page is told the reviewer is (a `role`, and
`permissions` granted or taken away, both in the host's own words).
`describeIdentity` says an identity in words. The ledger row reads
`mocked as <identity>`, and `get_comment_context` names the flags and the
identity and says the server acted as the reviewer.

**Breaking:** `RECIPE_VERSION` is 2 and every recipe is written as version 2,
so a build released before it refuses a new link or fence recipe rather than
applying half of it. Version 1 is still read, and comes back as version 2.
