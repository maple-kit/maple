---
"@maple-kit/mock": minor
---

The mock box reads a sentence where Maple's route plans one. `installMock({
route })` leaves a `plan` lookup on the handle (`routePlan`, over the real
`fetch`), and `createMockClient()` asks it once typing pauses, gates the answer
the calm-UI way (`readPlan`: nothing under 0.4, two suggestions within 0.15,
`unnamed` for `none`) and exposes `planning`, `suggestions`, `unnamed` and
`request` on its state. `suggest(index)` puts a suggestion's calls in its
state, and the sentence goes into the recipe's `request`. A route with no
planner turns the field back into a filter; `plan: false` keeps it one.
