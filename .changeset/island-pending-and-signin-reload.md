---
"@maple-kit/core": patch
"@maple-kit/ui": patch
---

The island now reads the comments again the moment a GitHub sign-in completes, instead of keeping the "Sign in before this deployment can show you its comments" banner until a reload. The client state gains `pending`, a count of store calls in flight; the island shows a small ring beside the wordmark while it is above zero, and Publish, Approve, Resolve, Reopen and the account button spin and disable themselves while their own call is out (the ring holds still under reduced motion). The check button is now labelled "Approve" and also resolves the comments you left that are still open. The "Page context" header is padded and its label is centred on the chevron.
