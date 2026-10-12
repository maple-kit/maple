---
"@maple-kit/core": patch
---

Correct `githubMedia`'s documentation: a reviewer's GitHub App user token (`ghu_`) cannot upload an attachment, so `token` must be a personal access token, such as a bot's fine-grained one scoped to the repository. `docs/screenshots.md` now wires the upload with a deployment-held token while comments are still posted with the reviewer's own.
