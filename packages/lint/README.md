# @maple-kit/lint

Design-system lint for [Maple](https://github.com/maple-kit/maple). This
package is the **rendered tier**: the rules that need a browser to have laid
the page out before they can judge it.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

<p align="center">
  <img src="https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets/features/design-lint.gif" alt="A preview is scanned and each design rule lands as a tick or a cross, with a raw colour and a small touch target ringed on the page. Below, the pull request's maple/design-lint check fails and the merge is blocked." width="480">
</p>

The rendered rules run today. The `maple/design-lint` check that holds the
merge, shown at the end of the clip, is in progress.

## Install

```sh
npm install @maple-kit/lint playwright
```

`playwright` is a peer: a run drives your browser, not one this package ships.

## Use

A static linter reads the source. A rendered rule reads what the cascade, the
theme and the media query finally produced, which is where an off-token colour
that arrived through three layers of `var()` actually becomes visible.

```ts
import { lintRendered } from "@maple-kit/lint";

const findings = await lintRendered({
  url: "https://preview-123.example.app",
  tokenFiles: ["src/styles/tokens.css"],
  bypassHeaders: { "x-vercel-protection-bypass": process.env.PREVIEW_BYPASS! },
});
```

Every finding carries the anchor cascade's own `Anchor`, recorded by
`describeElement` in the page, so it means the same thing by "where" that a
comment does. `findingComment(finding, { branch, context })` turns one into a
`Comment` the overlay pins; a run does not do that on its own.

## Rules

| Rule                             | What it finds                                     |
| -------------------------------- | ------------------------------------------------- |
| `maple/rendered-color-token`     | Colours the token set does not declare.           |
| `maple/rendered-type-scale`      | Font sizes off the type scale.                    |
| `maple/rendered-touch-target`    | Interactive elements under 24px on either axis.   |
| `maple/rendered-contrast`        | Text under the WCAG AA ratio for its size.        |
| `maple/rendered-motion-property` | Motion on anything but `opacity` and `transform`. |
| `maple/rendered-reduced-motion`  | Motion that survives `prefers-reduced-motion`.    |

[docs/lint.md](https://github.com/maple-kit/maple/blob/main/docs/lint.md) covers each of them and the tiers around this
one.

## What it cannot read

Hex, `rgb()`, `hsl()`, `color(srgb …)` and the named colours all read. A wider
gamut — `oklch()`, `color(display-p3 …)` — does not, and a run warns through
Maple's logger naming what it skipped rather than reporting a clean page it
did not fully check.

## Authentication

A run sends the preview platform's bypass as request headers and nothing else.
Reviewer cookies are never used: CI's lint run does not borrow a person's
session to see a page.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
