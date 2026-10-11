# @maple-kit/lint

## 0.3.1

### Patch Changes

- Updated dependencies [6649e59]
- Updated dependencies [c6416c8]
  - @maple-kit/core@0.20.0

## 0.3.0

### Minor Changes

- 83bffd2: Comments by an advisory author no longer hold the merge gate or an agent. `decideGate` takes `GateOptions.advisoryAuthors` (author ids), defaulting to the new `ADVISORY_AUTHORS` (`["maple-lint"]`); such comments count toward neither `open` nor `total`, so a lint-only surface neither blocks nor counts as reviewed. Pass `[]` to restore the old behaviour. `isAdvisory` is exported from `@maple-kit/core` and `@maple-kit/core/gate`, and the MCP Stop hook uses it, so a lint pin never keeps an agent from stopping. `LINT_AUTHOR.id` now comes from `ADVISORY_AUTHORS`, so the two cannot drift.

  Behaviour change: a comment by author id `maple-lint` that used to block now does not.

  `RouteOptions.advisoryAuthors`, `GateContext.advisoryAuthors` and the MCP handlers option carry a custom list to every `decideGate` caller. The route answers 403 to a comment posted by an identity whose id is in that list (the default when unset), so a reviewer cannot take the exemption by choosing that id; `isAdvisory` also requires `provenance: "server"`.

### Patch Changes

- Updated dependencies [0a71dab]
- Updated dependencies [b62f2a0]
- Updated dependencies [83bffd2]
- Updated dependencies [0a71dab]
- Updated dependencies [0a71dab]
- Updated dependencies [6a49a8c]
- Updated dependencies [b3a3f19]
- Updated dependencies [c689f72]
- Updated dependencies [0a71dab]
- Updated dependencies [b3a3f19]
- Updated dependencies [a2a3713]
- Updated dependencies [817ab18]
- Updated dependencies [aab18b6]
- Updated dependencies [a2a3713]
- Updated dependencies [1c7e69a]
  - @maple-kit/core@0.19.0

## 0.2.0

### Minor Changes

- 5750a12: Add the reporting half of the lint: `toSarif`, `verdictFor`, `unreachableVerdict`, `publishCheckRun` for the `maple/design-lint` check run, and `placeOf` to read a finding's `file:line:col`.

### Patch Changes

- @maple-kit/core@0.18.0

## 0.1.10

### Patch Changes

- d7a18bb: The npm page of every package now links https://maple-kit.org as its homepage. The repository link still opens the package's own folder.
- Updated dependencies [d7a18bb]
  - @maple-kit/core@0.17.1

## 0.1.9

### Patch Changes

- @maple-kit/core@0.17.0

## 0.1.8

### Patch Changes

- Updated dependencies [191b4ab]
- Updated dependencies [94880d9]
- Updated dependencies [6e998d1]
  - @maple-kit/core@0.16.0

## 0.1.7

### Patch Changes

- Updated dependencies [797fc01]
- Updated dependencies [ba6c9c4]
- Updated dependencies [ad204b9]
- Updated dependencies [2a29886]
- Updated dependencies [1aac368]
- Updated dependencies [b8e0ad8]
- Updated dependencies [3ca2d5f]
- Updated dependencies [92158b6]
- Updated dependencies [3ca2d5f]
- Updated dependencies [3ca2d5f]
  - @maple-kit/core@0.15.0

## 0.1.6

### Patch Changes

- Updated dependencies [48ae76a]
- Updated dependencies [d1554a9]
  - @maple-kit/core@0.14.1

## 0.1.5

### Patch Changes

- Updated dependencies [d1923ff]
  - @maple-kit/core@0.14.0

## 0.1.4

### Patch Changes

- Updated dependencies [34cd66d]
- Updated dependencies [a5e0af6]
  - @maple-kit/core@0.13.0

## 0.1.3

### Patch Changes

- @maple-kit/core@0.12.1

## 0.1.2

### Patch Changes

- @maple-kit/core@0.12.0

## 0.1.1

### Patch Changes

- Updated dependencies [b7a0f25]
- Updated dependencies [2bf7ed3]
- Updated dependencies [b7a0f25]
- Updated dependencies [6ac8d9b]
- Updated dependencies [b7a0f25]
  - @maple-kit/core@0.11.0

## 0.1.0

### Minor Changes

- f76c3e7: `lintRendered({ url, tokenFiles, viewports, bypassHeaders })` runs Chromium
  over a deployed preview and reports what only a laid-out page can show: colours
  and font sizes off the token set, touch targets under 24px, WCAG AA contrast
  failures, motion on properties other than `opacity` and `transform`, and motion
  that survives `prefers-reduced-motion`. Findings carry the anchor cascade's own
  `Anchor`, and `findingComment()` turns one into a `Comment` the overlay pins
  where it was found.

  Colours are read as hex in all four lengths, `rgb()`, `hsl()`, `color(srgb …)`
  and the 148 named colours; anything wider is named in a warning rather than
  silently narrowing what the run checked. A run that
  found no token of a kind reports nothing for that rule and says so, rather than
  reporting every value on the page.

### Patch Changes

- Updated dependencies [0606059]
- Updated dependencies [4493ac7]
- Updated dependencies [2271457]
- Updated dependencies [5d832df]
- Updated dependencies [4b8e7c9]
- Updated dependencies [1cb2f6f]
- Updated dependencies [a02a975]
- Updated dependencies [b66c3c0]
- Updated dependencies [eccf75c]
- Updated dependencies [decec98]
- Updated dependencies [c597ef7]
- Updated dependencies [2abe3f0]
- Updated dependencies [78f0692]
- Updated dependencies [264e019]
- Updated dependencies [9591b2d]
- Updated dependencies [4acc6db]
- Updated dependencies [2abe3f0]
- Updated dependencies [4ae5179]
  - @maple-kit/core@0.10.0
