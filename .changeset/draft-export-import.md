---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

Unsent comments can move between browsers. The unsent list has an **Export** button that saves `{ version, branch, drafts }` as JSON, and the island has **Import drafts**, which takes a paste or a dropped file, skips ids already here or already sent, reports entries that are not drafts, and asks before adding drafts written on another branch. When the island opens and another `maple:drafts:*` key on the origin holds live drafts, a quiet row offers **Move here** or **Dismiss**; nothing is merged automatically. `MapleClient` gains `draftsAsJson`, `previewDraftImport`, `importDrafts`, `foreignDrafts`, `moveDrafts` and `dismissDrafts`, `DraftKeeper` gains `importDrafts`, `foreign`, `adopt` and `dismiss`, and `@maple-kit/core/client` exports `readDraftExport` and `writeDraftExport`. A stored draft without an `updatedAt` string is now dropped as malformed.
