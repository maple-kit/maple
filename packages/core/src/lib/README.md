# Ported helpers

Code in this directory exists so that Maple does not take a dependency for a
handful of functions. The rule that governs it:

> If fewer than about five functions of a library are needed, port them here
> with attribution and unit-test them. Take the dependency only when the
> library's surface is genuinely used.

Every file here states, in its header, which dependency it replaces and why the
behaviour differs where it does. Each one has tests next to it.

| File                     | Replaces                                          | Why not the dependency                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stable-stringify.ts`    | `safe-stable-stringify`                           | One function is needed. Maple wants a cycle to throw, not to be replaced with a marker, because a cyclic comment payload is a bug upstream.                                            |
| `approx-string-match.ts` | `approx-string-match` (Robert Knight, MIT)        | One function is needed. Upstream runs Myers' bit-parallel algorithm; this runs Sellers' dynamic programme with Ukkonen's cutoff, which can be checked against a brute-force reference. |
| `match-quote.ts`         | Hypothesis client `match-quote.ts` (BSD-2-Clause) | Not published as a package. Two functions are needed, and an anchor that silently moves is the failure the whole cascade exists to avoid, so the scoring is ours to read and test.     |
