# @maple-kit/classifier

Model-backed classifier connectors for Maple's assist tier: a reviewer's
comment scored against configurable pillars, and a guess at what kind of
comment it is, while it is still being typed.

`docs/assist.md` in this repository is the design record — what a score is,
what it is never allowed to be, and why the seam has this shape.

## Install

```sh
npm install @maple-kit/classifier effect@rc @effect/ai-typesafe@rc
```

`effect` and `@effect/ai-typesafe` are peers. This package is the only one in
the Maple workspace on the Effect v4 release-candidate line; `@maple-kit/core`
stays on v3 and nothing published there moves.

## Use

```ts
import { jevClassifier } from "@maple-kit/classifier";
import { createRouteHandler } from "@maple-kit/core/route";

export const { GET, POST } = createRouteHandler({
  classifier: jevClassifier({ apiKey: process.env.TYPESAFE_API_KEY! }),
  store,
});
```

The connector is reached **from the server route and never from the browser**.
A model credential in a preview bundle is the failure this architecture exists
to prevent, and routing through the same origin is what leaves the host's
`connect-src` unchanged.

| Option      | Default                      | What it is                                                                    |
| ----------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `apiKey`    | —                            | The credential. Server-side only.                                             |
| `baseUrl`   | `https://api.typesafe.ai/v1` | The API root `/systemone` is appended to. A local reimplementation goes here. |
| `model`     | `jev-latest`                 | An alias or a pinned version id.                                              |
| `pillars`   | `DEFAULT_PILLARS`            | What to judge against. The host configures these; a reviewer never does.      |
| `timeoutMs` | `8000`                       | How long one judgement may take before it is abandoned as stale.              |

## What one request costs

Every pillar's question and the kind's travel in **one** request. jev reads the
comment once and answers each question against it in parallel, which is what
makes scoring on a keystroke affordable: five pillars plus the kind is a single
call of roughly 1,300 input tokens.

A mock plan is one request as well: the state as a `choice`, and one `noul`
question per call the page made.

There are no retries. This runs on a keystroke — a retry holds the request open
past the moment its answer was wanted, and the next keystroke is a better retry
than any schedule. A request is abandoned when its `signal` aborts, and a
failure is the caller's to swallow: the field keeps working, the score just
does not arrive.

## The probabilities are jev's

A `score` answer carries a probability for every level and a confidence, and
both are passed through. `scoreAtPosition` in `@maple-kit/core/connectors`
exists for a backend that has no probabilities of its own; this one does, and
re-deriving a spread from a position would throw away the thing worth carrying.

The one adjustment is arithmetic: jev rounds probabilities to two places, so a
distribution over three near-equal levels arrives summing to 0.99, and the
contract a surface relies on is that it sums to one.

## Contributing another

The seam is `ClassifierConnector`, not a vendor SDK. A new backend is a new
implementation of the same contract, run against `runClassifierContract` from
`@maple-kit/core/testing` like every other connector. See the
`contribute-connector` skill.
