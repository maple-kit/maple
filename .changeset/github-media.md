---
"@maple-kit/core": minor
---

Add `githubMedia`, a media connector that stores screenshots as GitHub user attachments in the pull request's repository, so a deployment needs no public bucket. It uploads with a user-to-server token (an installation token is refused by GitHub) and links the permanent attachment URL, so it can be passed to `githubStore` as `media`. It has no `remove`, because GitHub cannot delete an attachment.
