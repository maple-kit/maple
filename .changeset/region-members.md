---
"@maple-kit/core": minor
"@maple-kit/ui": minor
"@maple-kit/mcp": minor
---

A region now anchors to the elements it covers, not only to the box it was measured in. A rectangle drawn over a card used to be stored as fractions of the smallest element that held all of it, and when that was the page shell the rectangle drifted whenever the page's height changed.

`CommentAnchor` gains an optional `members` (`RegionMember[]`: an anchor, pixel offsets and overlap per element, at most four, tagged elements first). `resolveAnchor` resolves each member through the normal cascade and returns them on `Resolved.members`; a partly found or spread-out region is drawn from the members that resolved at lowered confidence, and with none found it uses the container fractions as before. Anchors stored without `members` resolve as they did.

New exports from `@maple-kit/core/anchor`: `captureMembers`, `membersBox`, `nameMembers`, `MAXIMUM_MEMBERS`, `MINIMUM_OVERLAP`. The ring, the markdown export, the gate's open-comment list, the Stop hook and `get_comment_context` name a region by its members ("BrewGuideCard +1"). `TargetRing` takes a `members` prop, and `Located` carries `members`.
