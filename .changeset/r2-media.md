---
"@maple-kit/core": minor
---

Add `r2Media` to `@maple-kit/core/connectors`, a media connector for a Cloudflare R2 bucket binding. The bucket is a structural type, so no Cloudflare types are required. Objects are keyed by 128 random bits under an optional `prefix`, and `url` lets a host choose the link `getUrl` returns, which a pull-request table needs because a `data:` image is stripped.
