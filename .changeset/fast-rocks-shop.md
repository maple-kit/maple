---
"@maple-kit/core": minor
---

Add screenshots at `@maple-kit/core/screenshot`.

`imageFrom` and `imageIn` take an image a reviewer pasted, dropped or chose —
the first-class path, not a fallback. `previewOf` gives a `blob:` URL for
showing it before upload, which is the one CSP directive Maple asks for.

`captureElement` renders an element and two ancestors through snapdom, an
optional peer imported only when a capture is asked for. It throws
`CaptureUnavailableError` naming the paste path rather than returning a blank
image, because a blank screenshot on a comment looks like evidence.
