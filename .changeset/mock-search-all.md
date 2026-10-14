---
"@maple-kit/core": minor
"@maple-kit/mock": minor
"@maple-kit/ui": minor
---

The mock box can reach what capture missed. Under the calls, "Search all APIs";
under the flags, "Search all flags". Each opens a focused field in place and
loads nothing until then, 20 results at a time, and a pick joins the draft,
marked "added". Escape closes only the search. The flag search reads the known
set in memory; the API search reads the tab's own calls first (the new
`Inventory.all()`), then the route's new `GET {base}/mock/calls?q=&cursor=`,
which lists the calls `MockRouteOptions.schemas` describes. It is gated as
`/mock/schema` is, and rate-limited per reviewer on the plan's rate. `ShapeIndex`
gains `calls`, `@maple-kit/core/mock` exports `CallEntry`, and `MockHandle` gains
`calls`. `MockClient` gains `setSearch`, `searchCalls` and `searchFlags`. The
box's size budget rises from 4.1 to 4.25 KB for the two buttons; the search
itself is a lazy chunk with its own 2 KB budget.
