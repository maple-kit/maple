# @maple-kit/ui

Maple's composed reviewer parts: the marks and the ring, the island, and the
composer. The surface a person actually touches on a preview deployment.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

<table>
<tr>
<td width="50%" valign="top"><img src="https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets/features/three-types.gif" alt="Three picks in a row: a metric card, a box dragged over part of a chart, and a sentence selected under it." width="100%"><br><b>An element, an area, or a passage.</b> Pick a component, drag a box over part of the page, or select the words that are wrong.</td>
<td width="50%" valign="top"><img src="https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets/features/overlay.gif" alt="A reviewer clicks a comment on a metric card, and the sheet opens with the comment, its author, its status, and the width and theme it was written at." width="100%"><br><b>Every comment carries its context.</b> The width, the colour scheme, a screenshot taken at the pick, and who wrote it.</td>
</tr>
</table>

## Install

```sh
npm install @maple-kit/ui
```

`react` and `react-dom` are peer dependencies. `@maple-kit/core` and
`@maple-kit/react` come with it.

## Use

```tsx
import { Maple } from "@maple-kit/ui/maple";

<Maple branch={import.meta.env.VITE_MAPLE_BRANCH} />;
```

It talks to the route [`@maple-kit/core`](../core) mounts at `/api/maple`.
Render it on preview builds only; `?maple=off` turns it off without a rebuild.

## What is in it

`@maple-kit/ui/maple` is the whole overlay as one component. The parts are also
exported on their own, for a host that wants to compose them differently:

| Entry                    | What it is                                                          |
| ------------------------ | ------------------------------------------------------------------- |
| `@maple-kit/ui/maple`    | `<Maple />`: everything below, composed.                            |
| `@maple-kit/ui/marks`    | The leaf on each commented element, and the ring around its target. |
| `@maple-kit/ui/island`   | The corner pill that opens into the list of comments.               |
| `@maple-kit/ui/composer` | The sheet a comment is written in, with its screenshot and score.   |
| `@maple-kit/ui/picker`   | Element, text and region picks.                                     |
| `@maple-kit/ui/notice`   | Failures the overlay reports in its own voice.                      |
| `@maple-kit/ui/mock`     | `<MapleMock />`, Maple Mock's box, for a page that mocks alone.     |
| `@maple-kit/ui/icons`    | The thirteen icons, one module each.                                |

Inside `<Maple />` the mock box is already mounted. [`@maple-kit/mock`](../mock)
shows what it does.

## Mounting under a strict CSP

Everything renders inside one shadow root, styled only through
`new CSSStyleSheet()` and `adoptedStyleSheets`, with positions set by
`style.setProperty()`. That is what lets Maple mount under
`script-src 'nonce' 'strict-dynamic'` without asking for a policy change — and
it stays checkable by reading one function.

Every part carries a size budget, held in CI by `scripts/size.js`. Raising one
is a decision recorded in a commit, not a number that drifts.

An application that would rather draw review comments in its own design
system uses the hooks in [`@maple-kit/react`](../react) and none of this
package.

## Documentation

- [The overlay and CSP](https://github.com/maple-kit/maple/blob/main/docs/overlay-csp.md)
- [Drafts and publishing](https://github.com/maple-kit/maple/blob/main/docs/drafts.md)
- [Screenshots](https://github.com/maple-kit/maple/blob/main/docs/screenshots.md)
- [UI conventions](https://github.com/maple-kit/maple/blob/main/docs/ui-conventions.md)

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
