# @maple-kit/mcp

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

### Minor Changes

- 09cbbbd: Implement the MCP server behind the tool contract, and add the Stop hook.

  `maple-mcp` serves `list_comments`, `wait_for_comments`, `resolve_comment` and
  `get_comment_context` over stdio. The wait is clamped to 55 seconds, under
  every client's ceiling, and a timeout comes back as a result rather than an
  error.

  `maple-stop-hook` keeps an agent from finishing while comments are open, and
  gives up after eight attempts rather than hanging the session.

- 3b2edc2: Keep the commit that resolved a comment, instead of returning it and losing it.

  `Comment.resolution` is a `CommentResolution` — the `sha` an agent says
  addressed the comment, an optional `note`, and the `at` it was written. It rides
  through the export fence like every other field, so the default GitHub store
  persists it without a line of storage code.

  `setStatus` takes it as an optional third argument and stays capability-by-
  presence: a store that cannot keep a resolution still records the status.
  `resolve_comment` now passes the `sha` and `note` it has always accepted, and
  the route reads a resolution off the `PATCH` body but stamps `at` itself — a
  client that can date its own resolution can backdate one.

  A comment cannot arrive already resolved, so the route drops a `resolution`
  posted with a new comment, and the shared store contract asserts a resolution
  survives a re-read.

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
