---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

`<Maple />` no longer needs a `branch`. Without one it asks the route's `GET {basePath}/context` once (new `readContext` on `@maple-kit/core/client`) and mounts with the branch, label, commit and pull request the route reports; the branch chip links to `pullRequestUrl`. `ContextBody` and `ContextReason` are exported as types from `@maple-kit/core/client`. A 404 means the deploy is not a preview and nothing mounts; a network error or 5xx on the first read is retried after 1 s, 3 s and 10 s before the overlay gives up; an unresolved answer shows the sign-in prompt and is read again once the reviewer links a GitHub account. Props still win over the response.

Breaking: `MapleRootProps.branch` is optional, and the standalone script no longer falls back to `"local"` when `data-branch` is absent (`maple review` still stamps it): it asks the route instead. The branch chip now reads the root's resolved surface by default.
