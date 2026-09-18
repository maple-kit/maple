---
"@maple-kit/core": minor
---

Add the build-time JSX tagger at `@maple-kit/core/tagger`.

It writes `data-maple-src` (`path:line:column`, repository-relative and
POSIX-separated) and `data-maple-name` onto intrinsic elements, so a comment
left on a deployed preview names a file and a line rather than a CSS selector.
React 19 removed the tree-side equivalent and a preview is a production build,
so there is nothing to read at runtime.

The entrypoint also exports the attribute names and the source-location format,
because the anchor cascade and the overlay have to agree with what was written.
