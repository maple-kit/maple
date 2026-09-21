# Assist: scoring a comment as it is written

A review comment is only worth what a reader can do with it. Maple's assist
tier judges the comment a reviewer is typing — how well it reads against a set
of pillars, and what kind of comment it looks like — and shows the answer
beside the field.

It is advice. That is the whole design constraint, and everything below follows
from it.

## What a score is not

- **Never a gate.** A score does not block a send, does not delay one, and
  never appears in the merge gate. `decideGate` reads statuses and nothing
  else, and it will stay that way.
- **Never a rewrite.** Maple does not edit a reviewer's words, propose a
  replacement sentence, or refuse to send what was typed.
- **Never a requirement.** The whole tier is optional. With no classifier
  connector configured, nothing is scored and nothing about the composer
  changes.

A tool that argues with a reviewer about their phrasing is switched off within
a week, and the merge gate is switched off with it. The score exists to make a
reviewer's next sentence easier to write, not to grade the last one.

## What a score is

Three things at once, and it is incomplete without all three:

|                      |                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **The level**        | Which rung of the pillar's ladder the comment reached, as an index into the pillar's own ordered levels. |
| **The distribution** | A probability for every level, summing to one. This is what says how nearly it was a different rung.     |
| **The confidence**   | How concentrated that distribution is, from nought to one.                                               |

```ts
{ pillar: "specific", level: 2, distribution: [0.08, 0.3, 0.62], confidence: 0.62 }
```

A bare number would have been smaller and dishonest. A judgement that landed
between two rungs really did land between them, and a surface that cannot say
so renders a guess as a fact — which is exactly how a reviewer learns to stop
believing the thing.

The kind guess has the same shape: a `kind`, a probability for every kind, and
a confidence.

## The pillars

The default five, each with three levels described as concrete situations
rather than as grades. `DEFAULT_PILLARS` in
`@maple-kit/core/connectors` carries the full text.

| Pillar       | What it asks                                                             |
| ------------ | ------------------------------------------------------------------------ |
| `specific`   | Does the comment name what is wrong, rather than only that something is? |
| `actionable` | Would a reader know what to change after reading this?                   |
| `concise`    | Is the comment as short as its point allows?                             |
| `standalone` | Does it read correctly without the page in front of you?                 |
| `located`    | Do the words say where on the page this is?                              |

**The host configures the set; a reviewer never does.** A pillar a reviewer can
move measures nothing, and a per-reviewer set makes two comments on the same
pull request incomparable.

**A classifier judges the comment text alone.** It is not given the anchor, the
component name or the screenshot — deliberately. Two of the pillars ask whether
the comment reads _without_ the page in front of you, and handing the
classifier the anchor would hide the very thing they measure.

## The kinds

`bug`, `request`, `copy`, `question`, `praise`, `other`. A fixed vocabulary
rather than a configurable one, because the kind is what an agent routes on and
a per-deployment vocabulary makes the agent loop undeployable.

`other` is an absence, not a judgement: it is where a comment lands when the
evidence points nowhere. A guess is never _only_ `other` — the distribution
still says what it nearly was.

## The connector kind

`ClassifierConnector` is the sixth connector kind, and it follows the same
doctrine as the other five: plain Promises at the boundary, structural types,
no Effect, and **capability by presence**.

```ts
export interface ClassifierConnector extends ConnectorMeta {
  readonly pillars: readonly Pillar[];
  score?(request: ScoreRequest): Promise<readonly PillarScore[]>;
  classify?(request: ClassifierRequest): Promise<KindGuess>;
}
```

Both methods are optional, so a backend that can only do one of the two is used
for that one. `pillars` is configuration rather than a capability claim: what
the connector _can do_ is still, only, its methods.

It is the one kind that requires no method at all. A classifier defining
neither is inert rather than invalid — it reports no capabilities and is never
called. The contract suite refuses it; construction does not.

**An unknown pillar is an error.** `score({ pillars: ["tone"] })` against a
connector that was never configured with `tone` rejects with an
`UnknownPillarError` rather than returning a zero. A silent zero is a comment
marked down on a dimension nobody measured, and it is indistinguishable from a
real bottom rung once it reaches a surface.

## The keyword baseline

`keywordClassifier()` is the zero-configuration tier: no network, no model, no
options. It is what the feature does with the model tier switched off, and it
is the floor every eval measures against — a model that cannot beat a word list
is not worth its latency.

It measures each pillar from length and sentence shape:

| Pillar       | How it is measured                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `specific`   | Named interface nouns, measurements, quoted runs and identifiers raise it; words that report a problem without naming it lower it. |
| `actionable` | An imperative opening is worth two signals; "should", "instead", "needs to" are worth one each.                                    |
| `concise`    | Word count. Twenty-five words or fewer is the top rung, eighty the bottom.                                                         |
| `standalone` | Naming things raises it; opening on a bare pronoun with nothing named pulls it to the bottom.                                      |
| `located`    | Place words and prepositional phrases — "in the header", "top right".                                                              |

Each measure returns a position in `[0, 1]`, and `scoreAtPosition` turns that
into a level with a distribution around it. The distribution is a bell rather
than a spike, because a heuristic that lands between two rungs should say so:
the baseline's confidence sits well below a model's for that reason, and that
is the correct answer rather than a limitation to fix.

It guesses the kind from keyword presence, giving every kind a share of the
probability, so a single matched word never reads as a certainty. Ties break
toward the earlier kind in `COMMENT_KINDS`; evidence for nothing at all is
answered with `other`.

It is a `ClassifierConnector` like any other and runs the same contract suite.
If it could not be, the kind would be shaped wrong.

## Writing one

```ts
import { runClassifierContract } from "@maple-kit/core/testing";

runClassifierContract({
  name: "my-classifier",
  create: () => Promise.resolve({ connector: myClassifier(options) }),
});
```

The suite asserts the semantics a surface relies on, never an implementation:
a judgement carries its own uncertainty, probabilities sum to one, a pillar
nobody configured is refused rather than scored nought, and a comment still
being typed is answered rather than rejected.

`memoryClassifier()` in `@maple-kit/core/testing` is the reference. It answers
from its options and records what it was asked; it judges nothing.

Two helpers are exported for connector authors whose backend has no
probabilities of its own:

- `scoreAtPosition(pillar, position)` — a measurement in `[0, 1]` becomes a
  level, a distribution and a confidence.
- `kindFromWeights(weights)` — per-kind evidence becomes a `KindGuess`.

A backend that _does_ return probabilities should return its own. The point of
carrying the distribution through the contract is that a real one survives to
the surface.

## Where the model tier goes

Not in `@maple-kit/core`. The provider lives in a separate package so core
stays on Effect v3, and it is reached **from the SDK route and never from the
browser** — a model credential does not belong anywhere a reviewer can read it,
and routing through the same origin is what keeps `connect-src` unchanged.

The seam is the connector, not a vendor SDK, which is why a hosted model and a
local one differ by configuration rather than by architecture.
