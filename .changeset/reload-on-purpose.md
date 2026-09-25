---
"@maple-kit/core": minor
"@maple-kit/mock": patch
---

Apply and reload, and Turn off, in the mock box and its banner reload the page
without the browser's "Leave site?" dialog, even while a comment draft is
open. The reviewer chose to reload, and the draft is saved first as it always
was. `navigateOnPurpose(view, url)` joins `@maple-kit/core/client` for any
surface that navigates on the reviewer's say-so; Discard in the leave prompt
uses it too.
