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
  plan?(request: MockPlanRequest): Promise<MockPlan>;
}
```

Every method is optional, so a backend that can only do one is used for that
one. `plan` reads a mock request rather than a comment; `docs/mock.md` has it. `pillars` is configuration rather than a capability claim: what
the connector _can do_ is still, only, its methods.

It is the one kind that requires no method at all. A classifier defining
none is inert rather than invalid — it reports no capabilities and is never
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

Not in `@maple-kit/core`. The provider lives in `@maple-kit/classifier` so core
stays on Effect v3, and it is reached **from the SDK route and never from the
browser** — a model credential does not belong anywhere a reviewer can read it,
and routing through the same origin is what keeps `connect-src` unchanged.

The seam is the connector, not a vendor SDK, which is why a hosted model and a
local one differ by configuration rather than by architecture.

## The jev provider

`jevClassifier()` is the first implementation. It peers on the Effect v4
release candidate, which carries the TypeSafe provider; core does not move, and
Effect appears nowhere on the package's boundary.

**Every pillar's question and the kind's travel in one request.** The System
One endpoint takes a `state` and a _named map_ of questions, reads the state
once and answers each question against it in parallel. That is what makes
scoring on a keystroke affordable at all: five pillars and the kind is a single
call of roughly 1,300 input tokens.

A pillar becomes a `score` question and the kind becomes a `choice`, because
those are what the answers mean:

| Maple                      | jev                                                    |
| -------------------------- | ------------------------------------------------------ |
| `Pillar.instruction`       | the question's `instructions`, plus the framing below  |
| `PillarLevel`              | one entry of the `score` question's ordered `criteria` |
| `PillarScore.level`        | the level index that took the most probability         |
| `PillarScore.distribution` | jev's own per-level probabilities                      |
| `CommentKind`              | one option of the `choice` question's `criteria`       |

Two sentences are appended to every pillar's instruction, and both were arrived
at by asking the model and reading the answers. Without the first, a model
judges whether the reported problem is real rather than how the comment reads.
Without the second, it marks a comment that is still being typed down for being
half a sentence — which is every comment this feature ever sees.

**The probabilities are jev's own.** `scoreAtPosition` exists for a backend
with none; this one has them, and re-deriving a spread from a position would
throw away the thing worth carrying. The single adjustment is arithmetic: jev
rounds to two places, so three near-equal levels arrive summing to 0.99, and
the contract a surface relies on is that they sum to one.

**There are no retries.** This runs on a keystroke. A retry holds the request
open past the moment its answer was wanted, and the next keystroke is a better
retry than any schedule. `ClassifierRequest.signal` abandons a judgement the
next keystroke made stale, and a request is never opened for a signal that has
already aborted.

`baseUrl` is the API root, defaulting to TypeSafe's own. Request-compatible
reimplementations exist, so hosted or local stays a configuration choice.

The key is `TYPESAFE_API_KEY` and it keeps the provider's name rather than
taking a `MAPLE_` one, so a rejected key says where to go. `MAPLE_AI_MODEL` and
`MAPLE_AI_API` are Maple's two knobs over it. `docs/configuration.md` has the
table, and the whole tier is optional: no key, no `assist` option, no change to
the composer.

## The surface

The card sits in the slot the context card folds out of, and everything it
draws comes from `ComposerState`.

**A pillar is one slot per rung, filled by the probability that rung took.**
Equal widths keep _which_ rung it is readable; the fill says how sure it was.
Three pale slots are visibly a shrug and one solid slot is an answer, which is
what makes the confidence legible with no key beside it. A number printed
beside a bar _is_ a key, and a key is a thing a reviewer stops reading.

The rows are laid out before there is anything to put in them, so nothing under
the card moves as the scores land. There is no spinner per pillar: five things
moving beside a field somebody is typing in is worse than five still ones.

**The kind is a control.** A reviewer's own label beats any classifier, so the
chip starts on the guess and is never stuck on it. A guess the classifier was
unsure of names both kinds it was torn between — _bug or request_ — which says
so without a number. The choice lives in `ComposerState`; carrying it onto the
posted comment changes `Comment` and the markdown fence, and is its own
decision.

**The context card collapses rather than disappears.** It is on screen while
the comment is written because it is half of what Maple has and a comment box
does not, and the first keystroke is the moment attention moved to the words.
Folded, it keeps the width — the one fact anyone reads off it — and it reopens
only when a reviewer asks. A stored comment's context does not fold at all:
nothing is being typed beside it.

**The whole tier is off unless it is switched on.** `?maple-assist=off` joins
the chain the interface already has — query string, then the viewer's stored
preference, then props, then the default — and `setAssist` is the viewer's own
switch. With no classifier configured the route has no `/assist`, `/me` says
nothing about it, and the composer draws exactly what it drew before.
