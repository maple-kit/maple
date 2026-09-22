---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

A comment is a draft until it is published.

Maple posted the moment a reviewer pressed the button. A review is a pass over
a page rather than a single remark, so four findings were four notifications
and — since the pull-request ledger — four reposts. The composer now offers
**Keep** and **Publish**, and the island grows an **Unsent** section: what is
waiting, one control that publishes all of it, and a **Copy** that puts every
unsent comment on the clipboard as markdown, which is the way out of a
deployment whose store is down or absent.

Batching only works if losing a batch is hard, so `beforeunload` is now
attached whenever anything is unpublished rather than only while the composer
is dirty, and `confirmOnUnload` defaults to on.

**Breaking:**

- `MapleClient.send()` is gone. `publish(ids?)` replaces it and returns every
  comment it stored; `keepDraft()` closes the composer without publishing.
- `discardDraft` takes an optional id, so a row can drop a draft the composer
  is not on.
- `ClientState` gains `publishing`; `FailedCall` is unchanged, a failed publish
  still reports `send`.
- `Maple.Actions` exports `KEEP_LABEL` and `PUBLISH_LABEL` in place of
  `CANCEL_LABEL` and `SEND_LABEL`.
- `StoreConnector.appendMany` is a new optional method, so
  `capabilitiesOf("store", …)` reports one more key.
- `POST /comments` accepts an array and answers `{ comments }` for one.
