# @maple-kit/ui

Maple's composed reviewer parts: the marks and the ring, the island, and the
composer. The surface a person actually touches on a preview deployment.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Install

```sh
npm install @maple-kit/ui
```

`react` and `react-dom` are peer dependencies. `@maple-kit/core` and
`@maple-kit/react` come with it.

## What is in it

`@maple-kit/ui/maple` is the whole overlay as one component. The parts are also
exported on their own: `/marks`, `/island`, `/composer`, `/picker`, `/notice`,
`/mock` and `/icons`.

`@maple-kit/ui/mock` is Maple Mock's box, `<MapleMock />`, for a page that
mocks without the review overlay. Inside `<Maple />` it is already mounted.

Everything renders inside one shadow root, styled only through
`new CSSStyleSheet()` and `adoptedStyleSheets`, with positions set by
`style.setProperty()`. That is what lets Maple mount under
`script-src 'nonce' 'strict-dynamic'` without asking for a policy change — and
it stays checkable by reading one function.

Every part carries a size budget, held in CI by `scripts/size.js`. Raising one
is a decision recorded in a commit, not a number that drifts.

## Documentation

- [The overlay and CSP](https://github.com/maple-kit/maple/blob/main/docs/overlay-csp.md)
- [UI conventions](https://github.com/maple-kit/maple/blob/main/docs/ui-conventions.md)

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
