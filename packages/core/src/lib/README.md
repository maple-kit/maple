# Ported helpers

Code in this directory exists so that Maple does not take a dependency for a
handful of functions. The rule that governs it:

> If fewer than about five functions of a library are needed, port them here
> with attribution and unit-test them. Take the dependency only when the
> library's surface is genuinely used.

Every file here states, in its header, which dependency it replaces and why the
behaviour differs where it does. Each one has tests next to it.

| File                  | Replaces                | Why not the dependency                                                                                                                      |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `stable-stringify.ts` | `safe-stable-stringify` | One function is needed. Maple wants a cycle to throw, not to be replaced with a marker, because a cyclic comment payload is a bug upstream. |
