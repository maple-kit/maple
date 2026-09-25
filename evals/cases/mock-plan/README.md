# Mock plan cases

Each case pairs a sentence a reviewer types into the mock box with the calls a
page made, the way `POST /mock/plan` hands them to a planner.

## Inventories

`inventories.json` holds seven pages' calls, each as `{ key, summary }` in the
form the route sends: the names in the call's last answer, and its schema in
one line. Three written pages, the dashboard, the order queue and the roast
detail, also carry the page's `flags` (`{ key, type, variants? }`, as the box
lists them) and the host's `roles`: 6 to 12 flags each, in the naming styles
real flags come in (kebab, camel, a ticket prefix such as `ROAST-2210-`),
booleans with a few string and number flags among them, and six roles, two of
them hyphenated.

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

**Sets.** A case with `set: "layers"` (29, `mockplan-066` on) was written for
flags and roles; every other case is the data set. They are scored and
gated apart, because the layer sentences mostly name no data state, which a
word list gets right by matching nothing. The keyword planner's flag and role
reading was tuned after these cases were written, by the same agent, so its
layer score flatters it most of all.

**Labels.** `state` is always labelled. `calls` lists the calls the sentence
must concern, and is left out where that is arguable. `maybe` lists calls a
reader could argue either way; they count neither for nor against a plan. A
`none` case has no `calls`.

## Scores

Per set, as state accuracy / call F1 / layer accuracy. Layers are scored on
the three pages with flags and roles: exactly the flags, at exactly the
values, and the role meant, nothing more.

| Tier    | Data set (65)      | Layers set (29)    | Thresholds (data; layers)              | When                                       |
| ------- | ------------------ | ------------------ | -------------------------------------- | ------------------------------------------ |
| keyword | 92.3 / 67.6 / 97.0 | 100 / 66.7 / 82.8  | 0.90 / 0.65 / 0.95; 0.97 / 0.64 / 0.80 | every CI run                               |
| jev     | 95.4 / 74.9 / 98.0 | 83.9 / 69.8 / 93.1 | 0.92 / 0.74 / 0.97; 0.80 / 0.68 / 0.90 | `jev-latest`, `EVAL_SAMPLES=3`, with a key |

On the data set jev has to beat the keyword planner outright on state and
calls; on the layers set, on the layers. Its data misses were mostly
sentences a word list gets right by construction: "roast with no comments"
and "no comm" (read as something other than `empty` in some samples), and
"what does a cafe see when it can't see its orders". Its layers-set state
misses are sentences that mix a flag or a role with the data, such as
"queue sorted by priority" (read as `many`) and "a roaster who can't see the
cupping scores" (read as `none`).
