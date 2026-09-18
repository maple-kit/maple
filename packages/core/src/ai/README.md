# AI tier

Nothing here yet. This directory is reserved so the decision below is recorded
where the code will land.

## The decision

Every model call goes through `@effect/ai`'s `LanguageModel` service. Providers
are Layers, so swapping one is a Layer swap and not a rewrite, and an eval run
can pin a provider with `MAPLE_AI_MODEL=`.

## What that buys

- Prompts and their output schemas live here as Standard Schema types,
  independent of any provider.
- Everything in this tier is optional and non-blocking. Maple works with the AI
  tier switched off; classification routes and groups comments, it never gates
  them.
- A keyword baseline stays the zero-configuration default. The model tier is an
  upgrade on top of it, not a replacement for it.

## What must be true before code lands here

- Every AI path ships with an eval set and a pass-rate threshold that CI
  enforces. See `evals/README.md` for the conventions.
- Eval cases are real, anonymised comments collected during dogfooding. No
  synthetic-only sets.
