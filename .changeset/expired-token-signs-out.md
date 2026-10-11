---
"@maple-kit/core": patch
---

An expired or revoked GitHub token now signs the reviewer out instead of showing a store error. The route answers 401 and clears the session cookie, `MapleStoreError.reason` gains `"unauthorized"` for a 401 from the store's backend, and the overlay offers "Sign in" with the reviewer's drafts kept.
