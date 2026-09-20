---
"@maple-kit/core": minor
---

`decideGate` can say a pull request was never in Maple's scope.

`GateReason` gains **`no-review`**, reached with `decideGate(comments, {
hasReview: false })` and neutral like the other two. It is the fork, the bot's
version bump, the branch with no preview deployment: nothing is broken and
nothing is expected.

The gate reports on every pull request, so this is the case it reports most
often, and it had no reason of its own. Folding it into `unreadable` would have
told a reviewer that Maple failed to read comments on a pull request Maple was
never installed for; leaving it to each caller would have had every publisher
invent its own sentence for it. GitLab's external status checks and Bitbucket's
build statuses meet the identical case.

**Breaking:** a `switch` over `GateReason` grows an arm. `GateOptions` gains
`hasReview`, which defaults to true, so a caller that does not know about a
missing review keeps the behaviour it had.
