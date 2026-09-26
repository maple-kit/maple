# @maple-kit/classifier

Model-backed classifier connectors for [Maple](https://github.com/maple-kit/maple)'s
assist tier. It does two jobs, both from the server route:

- **Scores a comment while it is being typed**, against configurable pillars,
  and guesses what kind of comment it is.
- **Plans a mock from a sentence**: which state the reviewer meant, which of
  the page's calls it concerns, and which flags and role it names.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Scoring a comment

<p align="center">
  <img src="https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets/features/assist-scoring.gif" alt="A reviewer types 'Chart bars use a raw blue. Use the accent token.' on the throughput chart. It is tagged as a request and rated on five pillars: names the fault, says the change, tight, stands alone, placed." width="480">
</p>

A comment an agent can act on names the fault, says the change and reads
without the page in front of it. The composer shows where the draft sits on
each of five pillars, so a reviewer can tighten it before it is sent. The score
advises; it never blocks a send.

| Pillar       | The question it asks                                                     | Levels, worst to best                                |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `specific`   | Does the comment name what is wrong, rather than only that something is? | Names nothing · Names the thing · Names the fault    |
| `actionable` | Would a reader know what to change after reading this?                   | Reports only · Implies a direction · Says the change |
| `concise`    | Is the comment as short as its point allows?                             | Rambling · Padded · Tight                            |
| `standalone` | Does the comment read correctly without the page in front of you?        | Needs the screen · Partly anchored · Stands alone    |
| `located`    | Do the words say where on the page this is?                              | Unplaced · Roughly placed · Placed                   |

These are `DEFAULT_PILLARS` from `@maple-kit/core/connectors`. The host can
replace them; a reviewer never can, because a pillar a reviewer can move
measures nothing.

The kind is one of `bug`, `copy`, `question`, `request`, `praise` or `other`,
where `other` means no kind stood out rather than a verdict.

### What a score carries

Each pillar comes back with the level it reached, the probability of every
level, and a confidence, so a surface can say how nearly it was a different
level instead of presenting a guess as a fact:

```jsonc
{
  "scores": [
    { "pillar": "specific", "level": 2, "distribution": [0.02, 0.1, 0.88], "confidence": 0.81 },
    // …one per pillar
  ],
  "kind": {
    "kind": "request",
    "distribution": {
      "request": 0.84,
      "bug": 0.1,
      "copy": 0.03,
      "question": 0.01,
      "praise": 0.01,
      "other": 0.01,
    },
    "confidence": 0.77,
  },
}
```

The probabilities are jev's own, passed through. The one adjustment is
arithmetic: jev rounds to two places, so three near-equal levels can arrive
summing to 0.99, and the contract promises one.

### How well it scores

Measured on thirty review comments written against a running application, by
`evals/assist.eval.test.ts`. Kind is exact match; pillars is the share of
labelled rungs hit.

| Tier                                 | Kind  | Pillars | CI threshold |
| ------------------------------------ | ----- | ------- | ------------ |
| `keywordClassifier()`, the word list | 40.0% | 60.4%   | 35% / 55%    |
| `jevClassifier()`                    | 73.3% | 89.9%   | 65% / 82%    |

The word list runs on every CI run and is the floor: a model that cannot beat
it is not worth its latency. A threshold is raised when the code improves and
never lowered.

## Planning a mock

<table>
<tr>
<td width="50%" valign="top"><img src="https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets/features/edge-case-states.gif" alt="A table of open reviews loads with real data, then empty, then failing, with a banner naming the state each time." width="100%"><br>A sentence such as "the reviews list fails" becomes the <code>error</code> state on the one call it concerns.</td>
<td width="50%" valign="top"><img src="https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets/features/external-variables.gif" alt="A reviewer types 'as a member, with the merge forecast on', and the mock box sets the role to member and turns the merge-forecast flag on." width="100%"><br>"As a member, with the merge forecast on" sets the role and turns one flag on, for the reviewer to check before the page reloads.</td>
</tr>
</table>

[Maple Mock](../mock) sends the reviewer's sentence, the page's route and its
calls to the route's `/mock/plan`, and the classifier answers with a plan:

```jsonc
{
  "state": "empty",
  "distribution": { "empty": 0.91, "error": 0.03, "none": 0.02 /* …every state */ },
  "confidence": 0.86,
  "calls": [
    { "key": "rest:GET /api/reviews", "concerned": true, "p": 0.94 },
    { "key": "rest:GET /api/audit", "concerned": false, "p": 0.08 },
  ],
  "flags": [{ "key": "merge-forecast", "value": true, "concerned": true, "p": 0.88 }],
  "role": { "role": "member", "p": 0.9 },
}
```

**The model picks; it never writes a response body.** `@maple-kit/mock`
reshapes the response the page already received, or one sampled from its
schema, so the app's own parser still accepts it.

Measured on 94 sentences against seven pages' calls, by
`evals/mock-plan.eval.test.ts`, as state accuracy / call F1 / layer accuracy:

| Tier    | Data set (65)      | Layers set (29)    | Values set (36)    |
| ------- | ------------------ | ------------------ | ------------------ |
| keyword | 92.3 / 69.0 / 97.0 | 100 / 66.7 / 82.8  | 94.4 / 61.8 / 100  |
| jev     | 94.4 / 76.6 / 98.0 | 87.4 / 69.8 / 93.1 | 88.9 / 81.7 / 92.2 |

[`evals/cases/mock-plan/README.md`](https://github.com/maple-kit/maple/blob/main/evals/cases/mock-plan/README.md)
has the thresholds and what the set still needs.

## Install

```sh
npm install @maple-kit/classifier effect@rc @effect/ai-typesafe@rc
```

`effect` and `@effect/ai-typesafe` are peers. This package is the only one in
the Maple workspace on the Effect v4 release-candidate line; `@maple-kit/core`
stays on v3 and nothing published there moves.

## Use

One connector serves both jobs. Hand it to the route's `assist` for scoring
and to `mock.plan` for planning:

```ts
import { jevClassifier } from "@maple-kit/classifier";
import { keywordClassifier } from "@maple-kit/core/connectors";
import { createMapleHandler } from "@maple-kit/core/route";

const apiKey = process.env.TYPESAFE_API_KEY;
const classifier = apiKey ? jevClassifier({ apiKey }) : undefined;

const handler = createMapleHandler({
  store,
  ...(classifier ? { assist: { classifier } } : {}),
  mock: {
    preview: true,
    plan: { classifier: classifier ?? keywordClassifier() },
  },
});

export { handler as GET, handler as POST };
```

Without `assist`, `/assist` answers 404 and the composer is unchanged: the
whole tier is off unless switched on. `keywordClassifier()` plans offline with
no credential, which is what the examples fall back to.

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

The route adds a cache (200 judgements) and a rate limit (40 calls a minute
per session) in front of the connector; `assist.cacheSize` and `assist.rate`
change them.

## What one request costs

Every pillar's question and the kind's travel in **one** request. jev reads the
comment once and answers each question against it in parallel, which is what
makes scoring on a keystroke affordable: five pillars plus the kind is a single
call of roughly 1,300 input tokens.

A mock plan is one request as well: the state as a `choice`, and one `noul`
question per call the page made. Flags and the role, when the page has any, go
in a second request, so the state and the calls are judged exactly as they are
without them.

There are no retries. This runs on a keystroke — a retry holds the request open
past the moment its answer was wanted, and the next keystroke is a better retry
than any schedule. A request is abandoned when its `signal` aborts, and a
failure is the caller's to swallow: the field keeps working, the score just
does not arrive.

## Contributing another

The seam is `ClassifierConnector`, not a vendor SDK: optional `score`,
`classify` and `plan` methods, detected by presence. A new backend is a new
implementation of the same contract, run against `runClassifierContract` from
`@maple-kit/core/testing` like every other connector. See the
`contribute-connector` skill.

## Documentation

- [The assist tier](https://github.com/maple-kit/maple/blob/main/docs/assist.md) — what a score is, and what it is never allowed to be
- [Maple Mock: the plan](https://github.com/maple-kit/maple/blob/main/docs/mock.md#the-plan)

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
