---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

A screenshot is now uploaded when its comment is published, not when it is attached. While a comment is a draft the image stays in memory and is previewed locally, so attaching makes no request and removing it or discarding the draft uploads nothing. `client.publish()` uploads each draft's image and then posts the comments; if an upload fails nothing is posted, the draft and its image are kept, and the error is `MapleFailure` with `during: "upload"`, which `Maple.Notice` shows beside the send errors. An image is not saved with a draft across a reload.

Breaking: `Maple.Attachments` no longer shows an upload failure chip, `ATTACH_WORDS.failed` is gone, and `Maple.Attachments`' `upload` override runs at publish. New on the client: `holdImage`, `releaseImage`, `ComposerState.held` and `HeldImage`, and `"upload"` in `FailedCall`.
