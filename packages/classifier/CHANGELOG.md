# @maple-kit/classifier

## 0.5.0

### Minor Changes

- bdffcc5: Score a comment with a model: `@maple-kit/classifier` and its jev provider

  A new package, `@maple-kit/classifier`, exports `jevClassifier()` — a
  `ClassifierConnector` backed by a System One decision model. Every pillar's
  question and the kind's travel in one request, because that is what makes
  scoring a comment as it is typed affordable. It returns the provider's own
  probabilities and confidence rather than a spread re-derived from a position.

  It peers on the Effect v4 release candidate, which is the line carrying the
  TypeSafe provider. `@maple-kit/core` stays on Effect v3 and nothing published
  there changes shape. Effect appears nowhere on the new package's boundary; a
  lint rule keeps it under `src/internal/`.

  **Breaking, in core:** `ClassifierRequest` gains an optional `signal`, so a
  judgement can be abandoned when the next keystroke makes it stale. Abort
  belongs with the fetch that needs it, which is the provider's. Nothing that
  implements the interface has to change; a connector reaching a network should
  honour it.

  Core also gains `COMMENT_KIND_DESCRIPTIONS`, the vocabulary's own definition of
  each kind, so two providers cannot quietly recognise two different sets of
  `bug`.

  `@maple-kit/classifier` joins the fixed version group with the other five
  packages, so it versions with them.

### Patch Changes

- Updated dependencies [f86a5c9]
- Updated dependencies [45a07cc]
- Updated dependencies [f86a5c9]
- Updated dependencies [4b922ba]
- Updated dependencies [bdffcc5]
- Updated dependencies [6e694c2]
  - @maple-kit/core@0.5.0
