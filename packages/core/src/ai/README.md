# AI tier

Nothing here yet. This directory is reserved so the decisions below are
recorded where the code will land.

## Two kinds of model, and only one of them is a language model

The first AI path Maple ships is **assist**: a comment scored against pillars
and guessed at for its kind, while a reviewer types. That is a _decision_
model's job — a typed judgement with probabilities, not generated text — and it
does not go through `LanguageModel`.

It goes through the **`ClassifierConnector`** kind instead, defined in
`../connectors/`, with `docs/assist.md` as its design record. Plain Promises at
the boundary, capability by presence, a contract suite and an in-memory
implementation in `../testing/` — the same doctrine as every other connector.

**This file used to say that every model call goes through `@effect/ai`'s
`LanguageModel`.** That predates the decision model, and a record that
contradicts the code is worse than no record.

Generative work — a fix plan, a pull-request description — is still a language
model's job and still belongs behind a Layer when it lands. Nothing has been
written for it yet, so nothing here describes it.

## Where a provider lives

**Not in `@maple-kit/core`.** A classifier provider lives in a separate
package, so core stays on Effect v3 while a provider can peer on whatever its
SDK needs. Core holds the contract and the zero-configuration keyword baseline,
and neither needs a network.

A provider is reached from the SDK route and never from the browser. A model
credential does not belong anywhere a reviewer can read it, and same-origin
routing is what keeps Maple's `connect-src` claim true.

## What that buys

- The seam is the connector, not a vendor SDK, so a hosted model and a local
  one differ by configuration rather than by architecture.
- Everything in this tier is optional and non-blocking. Maple works with it
  switched off, and **a score never blocks, gates, delays or rewrites a send.**
- The keyword baseline stays the zero-configuration default. The model tier is
  an upgrade on top of it, not a replacement for it.

## What must be true before code lands here

- Every AI path ships with an eval set and a pass-rate threshold that CI
  enforces. See `evals/README.md` for the conventions.
- Every eval measures against the keyword baseline. A model that cannot beat a
  word list is not worth its latency.
- Eval cases are real, anonymised comments collected during dogfooding. No
  synthetic-only sets.
