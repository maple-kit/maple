---
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

The mock box sets flags and who the page is shown as. `createMockClient()`
lists the flags the page evaluated (`state.flags`), reads the host's identity
rules (`state.identity`), drafts both (`draftFlags`, `draftAs`, with
`setFlag`, `setRole` and `setPermission`), counts the writes that reached the
server under `as` (`state.writes`), and applies a recipe that names flags or
`as` with no call. `MockHandle.identity()` reads the rules once, from the
options or the route.

`MapleMock` draws them in a panel loaded as a separate chunk, only on a page
with identity rules or evaluated flags, and its banner says "Showing as …. The
server still acts as you."

**Breaking:** `MockClientState` has five new fields, so a hand-built state
must set them, and `clear()` also empties the draft's flags and identity.
