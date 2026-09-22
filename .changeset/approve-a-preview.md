---
"@maple-kit/core": minor
"@maple-kit/ui": minor
---

A reviewer can approve a preview, and a gate can require one.

`decideGate([])` clears, which means a pull request nobody opened the preview
for reads exactly like one a designer looked over and liked. `requireApproval`
is the opt-in that separates them: on, a surface with nothing open blocks with
the new `awaiting-approval` reason until somebody presses **Approve** in the
overlay, and the clear verdict then names who signed off.

**Breaking:** `StoreConnector` gains three optional methods — `approvals`,
`approve` and `unapprove` — so `CONNECTOR_METHODS.store` and anything asserting
on `capabilitiesOf("store", …)` now report them. `GateReason` gains
`awaiting-approval` and `approval-untracked`, so an exhaustive switch over it
needs two more arms. `GET /me` answers with an `approval` field.

An approval is about a commit, never a branch: the route reads the sha from
`store.head` rather than from the browser, for the reason `docs/gate.md` gives
about the gate App's `Checks: write`. An approval nobody can be named for is
refused with a 401, so `requireApproval` needs an identity connector.
