# @maple-kit/react

React bindings for [Maple](https://github.com/maple-kit/maple)'s reviewer
controller. Hooks and nothing else — no DOM, no styles, no components.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Install

```sh
npm install @maple-kit/react
```

`react` is a peer dependency.

## What is in it

`MapleProvider` plus six `useSyncExternalStore` bindings over the controller in
`@maple-kit/core/client`. An application that renders review comments in its own
design system depends on this package and pulls in none of `@maple-kit/ui`.

The state machine lives one level below, in core, deliberately: a React hook is
not portable, and a controller is.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
