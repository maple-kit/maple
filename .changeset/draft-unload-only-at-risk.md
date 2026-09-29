---
"@maple-kit/core": patch
---

`beforeunload` is attached only while a reload would lose something: input in the open composer, a draft save still inside its debounce window, or drafts held only in memory because storage is blocked. Drafts already in `localStorage` no longer make every reload ask to leave, and no longer cost the page its back/forward cache. `DraftKeeper` gains `atRisk()`, and closing the composer now writes the draft immediately.
