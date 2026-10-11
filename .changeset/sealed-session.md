---
"@maple-kit/core": minor
---

The GitHub session cookie is sealed, and a secret is now required. The cookie used to be plain base64 of the token and login unless the optional `key` was set, and it was trusted as read: a cookie written by hand signed anyone in as any login. It is now AES-GCM under a key derived from a secret, with its issue and expiry times and purpose inside the seal, and a cookie that does not open reads as signed out.

Breaking: `githubAuth.key` and `SessionCookieOptions.key` are gone, replaced by a required `secret` (at least 32 bytes, for example `openssl rand -base64 48`; a list `[current, ...previous]` rotates it). `githubIdentity(options)` and `readGitHubSession(request, options)` take the options, with `secret`, as a required argument. `createMapleHandler` throws when `githubAuth.secret` is missing or short. Migrate by setting one secret (`MAPLE_SESSION_SECRET` in the examples) and passing it to `githubAuth`, `githubIdentity` and every `readGitHubSession` call. Existing sessions stop working and reviewers sign in again.
