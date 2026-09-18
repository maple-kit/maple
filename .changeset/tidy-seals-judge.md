---
"@maple-kit/core": minor
---

Add GitHub Device Flow at `@maple-kit/core/auth`.

`createDeviceFlow({ clientId })` gives a reviewer a short code to type, then
waits for them, honouring GitHub's polling interval and its `slow_down`
back-off. A preview URL differs on every deployment, so there is no stable
callback to register; Device Flow needs none.

It runs on the SDK route. A device code and a token are both credentials and
neither belongs in a bundle the browser downloads.
