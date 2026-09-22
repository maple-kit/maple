# @maple-kit/cli

## 0.8.0

### Patch Changes

- Updated dependencies [999dfb6]
  - @maple-kit/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [42f6077]
- Updated dependencies [24adb84]
- Updated dependencies [9d3df1b]
- Updated dependencies [f2132fc]
- Updated dependencies [101dd3b]
  - @maple-kit/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [18643c0]
  - @maple-kit/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [f86a5c9]
- Updated dependencies [45a07cc]
- Updated dependencies [f86a5c9]
- Updated dependencies [4b922ba]
- Updated dependencies [bdffcc5]
- Updated dependencies [6e694c2]
  - @maple-kit/core@0.5.0

## 0.4.0

### Patch Changes

- 64eabf6: A sixth connector kind: `ClassifierConnector`, for judging a comment as it is
  written.

  `score` and `classify` are both optional, so a backend that can only do one is
  used for that one, and `pillars` declares what it scores against. A score
  carries its distribution across the pillar's levels and a confidence, not just
  a level — a judgement that landed between two rungs has to be able to say so,
  or a surface renders a guess as a fact.

  `keywordClassifier()` is the zero-configuration tier: no network, no model, no
  options. It is what the feature does with the model tier switched off and the
  floor every eval measures against. `runClassifierContract` and
  `memoryClassifier` ship from `@maple-kit/core/testing`.

  **Breaking:** `ConnectorKind` gains `"classifier"`, so an exhaustive `switch`
  or a `Record<ConnectorKind, …>` over it no longer compiles until the new member
  is handled. `CONNECTOR_METHODS` and `REQUIRED_METHODS` gain a row each;
  `REQUIRED_METHODS.classifier` is empty, because a classifier that implements
  neither method is inert rather than invalid.

  `maple connectors` prints the sixth kind, and a kind that requires nothing now
  prints `required: none` rather than a blank the reader has to interpret.

  `docs/assist.md` is the design record — what a score is, and what it never is.

- Updated dependencies [8cdf898]
- Updated dependencies [64eabf6]
  - @maple-kit/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [f46ab2c]
  - @maple-kit/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [0b484de]
  - @maple-kit/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [69fb978]
  - @maple-kit/core@0.1.1

## 0.1.0

### Patch Changes

- 417376e: Every package publishes its licence, its notice and a readme. `files` was
  `["dist"]` and the three texts lived only at the repository root, so the
  artifact met none of Apache-2.0's redistribution terms and every npm page would
  have been blank.

  `@maple-kit/core` no longer carries a private copy of vitest. `/testing` imports
  `describe`, `it` and `expect` for the shared connector contract suite, and with
  vitest undeclared the build wrote it — and chai, expect-type, magic-string and
  tinybench — into `dist/node_modules/`, about half the tarball. Worse than the
  size: the suite registered its tests against that copy rather than the runner
  the consumer invoked, so it collected nothing. vitest is an optional peer
  dependency now, and running the contract suite means running it in your vitest.

- 567b444: Ship the docs in the type declarations and not in the JavaScript.

  Prose was about 46% of `@maple-kit/ui`'s gzipped weight, which is weight every
  application downloads to read something no runtime looks at. Every package's
  build now drops JSDoc from the emitted JavaScript and keeps it in the `.d.ts`,
  which is what an editor reads anyway.

  Two kinds of comment are kept deliberately. `@__PURE__` and
  `@__NO_SIDE_EFFECTS__` stay, because dropping them would silently cost
  tree-shaking. Legal notices stay, and the two ported files in
  `packages/core/src/lib/` are now marked `@preserve` so their BSD-2-Clause and
  MIT attributions reach the published build, which those licences require.

- Updated dependencies [bbb7433]
- Updated dependencies [8038da7]
- Updated dependencies [061766e]
- Updated dependencies [1cb6bcc]
- Updated dependencies [f99659d]
- Updated dependencies [8dd0e2e]
- Updated dependencies [038f2c7]
- Updated dependencies [cf9bd03]
- Updated dependencies [991363a]
- Updated dependencies [417376e]
- Updated dependencies [74adfe4]
- Updated dependencies [8c26051]
- Updated dependencies [473898c]
- Updated dependencies [3b2edc2]
- Updated dependencies [40f2ee4]
- Updated dependencies [22f0fc5]
- Updated dependencies [7181bfd]
- Updated dependencies [7212b52]
- Updated dependencies [02dadef]
- Updated dependencies [657204d]
- Updated dependencies [aed6bc7]
- Updated dependencies [16957ec]
- Updated dependencies [74adfe4]
- Updated dependencies [2d5eb8d]
- Updated dependencies [fbe201b]
- Updated dependencies [f09d860]
- Updated dependencies [25c47f5]
- Updated dependencies [d2f84b7]
- Updated dependencies [5eec274]
- Updated dependencies [a96ffa4]
- Updated dependencies [69ba1e5]
- Updated dependencies [567b444]
- Updated dependencies [16f5582]
- Updated dependencies [9fcecc0]
- Updated dependencies [33c1689]
- Updated dependencies [55dddc9]
- Updated dependencies [bf6e1ea]
  - @maple-kit/core@0.1.0
