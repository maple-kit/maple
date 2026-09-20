# The merge gate

A comment nobody addressed should stop a merge. That is the whole wedge: every
other tool in this space collects visual feedback and then trusts a person to
remember it.

The gate is two pieces, deliberately apart.

| Piece                                | Where                     | Vendor-specific |
| ------------------------------------ | ------------------------- | --------------- |
| Deciding whether a commit is blocked | `decideGate`, `core/gate` | No              |
| Saying so to a forge                 | `GateConnector`           | Yes             |

`maple/visual-review` is a GitHub check run, GitLab has external status checks,
and Bitbucket's enforcement is Premium-only. Three APIs over one decision. The
split is what keeps the check-run API out of core.

## The decision

```ts
import { decideGate } from "@maple-kit/core/gate";

const { comments } = await store.list({ branch });
const verdict = decideGate(comments, { statusTracked: supports(store, "setStatus") });
```

A `GateVerdict` carries a conclusion, a **reason**, a title, a markdown summary,
and the two counts. The reason is there because a summary sentence cannot be
branched on and the two neutrals need different answers from a person.

| Reason             | Conclusion | What happened                                      |
| ------------------ | ---------- | -------------------------------------------------- |
| `comments-open`    | `blocked`  | Somebody's comment is unaddressed                  |
| `all-resolved`     | `clear`    | Every comment was resolved                         |
| `no-comments`      | `clear`    | Nobody commented                                   |
| `unreadable`       | `neutral`  | The store could not be read at all                 |
| `status-untracked` | `neutral`  | The store cannot record that anything was resolved |
| `no-review`        | `neutral`  | Maple was never reviewing this pull request        |

### Everything but `resolved` blocks

`BLOCKING_STATUSES` is `open`, `needs_reverify` and `orphaned`. The last is the
one worth arguing about: an orphaned comment is one whose anchor no longer
matches the page. Letting it pass would mean **a layout change that orphans a
comment silently clears the gate**, which is the failure mode to design against
rather than the convenience to optimise for. `blockOn` narrows it where a team
decides otherwise.

### Neutral is "I cannot tell", never "fine"

`decideGate(undefined)` is a store that could not be read. A store with no
`setStatus` keeps status client-side, so nothing it reports can be trusted to
mean resolved, and blocking on it would be blocking on a guess. Both are
neutral, and both say which one they are.

`hasReview: false` is the third neutral, and it is not an "I cannot tell" at
all: a fork, a bot's version bump, a branch with no preview deployment. Nothing
is broken and nothing is expected. It is a separate reason rather than a flavour
of `unreadable` because the check would otherwise tell a person that Maple
failed to read comments on a pull request Maple was never installed for — and
because the gate must report on every pull request, so this is the case it
reports most often. The caller decides it, since only the caller knows whether a
preview exists; the sentence a reviewer reads is written once, here.

## Publishing it

```ts
export interface GateConnector extends ConnectorMeta {
  publish(report: GateReport): Promise<void>;
  read?(target: GateTarget): Promise<GateVerdict | undefined>;
}
```

A `GateTarget` is a branch **and a commit**. A gate is never about a branch
alone: a new push is a new decision, and a verdict that outlives the commit it
was about is a verdict that lies.

`read` is optional, because not every forge will hand back what it was told.

### What the contract suite protects

`runGateContract` in `@maple-kit/core/testing` asserts the property that sank
Chromatic: **a gate that blocks must be able to stop blocking, on the same
commit, with no new push.** A reviewer resolving the last comment expects the
merge button to light up; asking them to push an empty commit to unstick CI is
how a required check gets deleted from the ruleset within a week.

## What the GitHub gate will have to do

Not built yet. Recorded here so the next person does not rediscover it:

- **Only a GitHub App can create a check run.** The gate authenticates as
  itself and never needs a user token — which is why it is a _second_ app.
  `docs/github-auth.md` has the reasoning: a user-to-server token is bounded by
  its app's permissions, so an app carrying `Checks` and `Contents` would hand
  every reviewer's token read access to the source.
- **Blocked is `in_progress`, not `failure`.** A required check passes only on
  `success`, `skipped` or `neutral`, so `in_progress` blocks exactly as hard as
  a failure and can still be exited. Updating a _completed_ run is unreliable,
  so a completed run is never where the gate parks.
- **Report on every pull request**, including forks, Dependabot and anything
  with no preview, and conclude `neutral` there. A required check that never
  reports on some pull requests is a required check somebody removes.
- **Subscribe to `merge_group.checks_requested` and pass immediately.** A merge
  queue entry has no preview and nobody to comment on it. This exact hang is
  what sank Chromatic.
- **Pin `integration_id` in the ruleset**, or anyone with push access can forge
  a green status under the same check name.
