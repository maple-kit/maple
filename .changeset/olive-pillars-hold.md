---
"@maple-kit/core": minor
"@maple-kit/cli": patch
---

A sixth connector kind: `ClassifierConnector`, for judging a comment as it is
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
