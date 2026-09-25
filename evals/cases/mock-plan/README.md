# Mock plan cases

Each case pairs a sentence a reviewer types into the mock box with the calls a
page made, the way `POST /mock/plan` hands them to a planner.

## Inventories

`inventories.json` holds seven pages' calls, each as `{ key, summary }` in the
form the route sends: the names in the call's last answer, and its schema in
one line.

- **`recorded`** (two): captured from the Vite and Next examples running in
  Chromium, with the box's own summaries, then passed through the route with
  each example's own schema. Nothing edited.
- **`written`** (five): pages of a coffee roaster's back office, written to
  the size a real application's pages reach rather than the examples' two to
  four calls. Typical pages make 7 to 12 calls across several namespaces and a
  heavy detail page 28; calls come as `list` / `get` / `count` siblings, stats
  and their `*Sparkline` twins, cursor envelopes (`nextCursor`, `totalCount`,
  `hasMore`), batched `listByXIds` lookups, a current-user call, and mutations
  among the reads. Every name is invented.

A mutation's summary says nothing about its being one, because neither the
page nor the route says so; a planner has to tell a write by its name.

## Cases

`cases.json`. **`by` is `agent` for every case so far**: the sentences were
written by the agent that also wrote the keyword planner. That is the bias
`../../README.md` warns about, and the keyword planner's state score is
inflated by it: it was written by someone who knew which words it matches.
Cases typed by a maintainer or a reviewer, against these inventories or a real
page, are what this set most needs, and they get their own `by`.

**Labels.** `state` is always labelled. `calls` lists the calls the sentence
must concern, and is left out where that is arguable. `maybe` lists calls a
reader could argue either way; they count neither for nor against a plan. A
`none` case has no `calls`.

## Scores

| Tier    | State accuracy | Call F1 | Threshold   | When                                       |
| ------- | -------------- | ------- | ----------- | ------------------------------------------ |
| keyword | 92.3%          | 67.6%   | 0.90 / 0.65 | 65 cases, every CI run                     |
| jev     | 94.4%          | 76.7%   | 0.92 / 0.74 | `jev-latest`, `EVAL_SAMPLES=3`, with a key |

jev also has to beat the keyword planner outright on both. Its misses were
mostly sentences a word list gets right by construction: "roast with no
comments" and "no comm" (read as something other than `empty` in some
samples), and "what does a cafe see when it can't see its orders".
