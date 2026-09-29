---
"@maple-kit/core": patch
---

`GET /mock/identity` answers `200 { "identity": null }` in a preview that declares no identity rules, instead of 404. The browser logged that 404 as a failed request on every page load. It still answers 404 when `preview` is false.
