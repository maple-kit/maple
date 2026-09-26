---
"@maple-kit/core": minor
---

A started client reads the branch's comments again every 15 seconds, so a
comment an agent resolved shows as resolved without a reload. A hidden tab
makes no requests and asks again as soon as it is shown. A failed read keeps
the last list and only logs a warning, and a list changed locally while the
read was in flight is kept. `MapleClientOptions.pollMs` sets the interval
(`0` turns it off), and `MapleClient.refresh()` runs one quiet read.
