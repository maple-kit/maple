---
"@maple-kit/core": minor
---

Add `githubMedia`, a media connector that stores screenshots as GitHub user attachments in the pull request's repository, so a deployment needs no public bucket. It uploads with a user-to-server token (an installation token is refused by GitHub) and links the permanent attachment URL, so it can be passed to `githubStore` as `media`. It has no `remove`, because GitHub cannot delete an attachment.

Wire it through the existing `media` resolver, building the connector from the reviewer's session. The route now answers a `POST /media` as follows: with `githubAuth` set and a resolver that returns null, `401` rather than a `404` that read as "no screenshots"; a backend's `UpstreamError` as `502` with its status and message, or `401` with the session cleared when GitHub says the token expired, rather than a `500`. No existing option changed shape.
