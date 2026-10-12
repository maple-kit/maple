# Design-lint cases

Thirty elements, each judged against one design-system rule: does this element
violate it? They are what `jevRules` in `@maple-kit/classifier` is scored on,
and the floor it has to clear is a deterministic heuristic over the same HTML.

## Where they came from

The domain is a coffee-beans ordering app at production scale: checkout,
account, a catalogue and a basket, with real-looking markup, design tokens
(`var(--color-feedback-danger-bg)`), component hooks (`data-component`,
`data-variant`, `data-action`) and nested components.

Every case is `by: agent`, written for the set. They are synthetic, which
`evals/README.md` warns about: they encode what the author expected a
violation to look like. That is why each rule carries near-misses a reader
would not call violations (a hex-looking order reference in text, a dismiss
button that is not a destructive action, an `aria-label` that does expose the
full text) and violations a keyword scan does not see (a named colour, a
disabled button whose `title` says "Disabled"). Real cases from a running
application replace these as dogfooding collects them.

## The rules

Six cases per rule, three violations and three not.

| Rule                         | A violation is                                                         |
| ---------------------------- | ---------------------------------------------------------------------- |
| `design/error-banner-tokens` | An error banner that uses a raw colour rather than a token.            |
| `design/destructive-button`  | A permanent delete, remove or cancel not styled as destructive.        |
| `design/empty-state-cta`     | An empty state with no call to action leading to what to do next.      |
| `design/truncated-title`     | A label truncated with an ellipsis that does not expose its full text. |
| `design/disabled-reason`     | A disabled control that gives the user no reason it is disabled.       |

Fifteen cases are violations (`violation: true`) and fifteen are not.

## Labels are frozen

The labels were committed before any model was run on them.
`evals/design-lint-labels.eval.test.ts` holds the sha256 of `cases.json` and fails
when the file changes. **Do not revise a label, or the HTML a label is about,
after seeing a tier's answers.** A case that is arguable stays as written,
both tiers are scored against it, and only the absolute numbers move. A real
mistake in a label is fixed in a commit that changes the hash in the same
diff and says why, so a reviewer sees it.

Ids (`design-<nnn>`) are never reused.

## What is scored

`evals/design-lint.eval.test.ts` scores accuracy: a case is right when the
judge flags the element exactly when `violation` is true.

| Tier      | Measures                                                            | Measured | Threshold |
| --------- | ------------------------------------------------------------------- | -------- | --------- |
| heuristic | Accuracy of one regex or attribute test per rule.                   | 0.633    | 0.63      |
| jev       | Accuracy of `jevRules` at its default threshold, over the baseline. | not run  | 0.63      |

The model threshold was set before jev was ever run on this set, equal to the
heuristic's score, because nothing else was measured. **TODO (owner): run the
`Design-lint eval` workflow with the key, record the score here, and raise the
threshold to just under the lowest of the first runs.** It must then only go
up.
