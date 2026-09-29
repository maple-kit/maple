# Ported helpers

Code in this directory exists so that Maple does not take a dependency for a
handful of functions. The rule that governs it:

> If fewer than about five functions of a library are needed, port them here
> with attribution and unit-test them. Take the dependency only when the
> library's surface is genuinely used.

Every file here states, in its header, which dependency it replaces and why the
behaviour differs where it does. Each one has tests next to it.

| File                     | Replaces                                          | Why not the dependency                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stable-stringify.ts`    | `safe-stable-stringify`                           | One function is needed. Maple wants a cycle to throw, not to be replaced with a marker, because a cyclic comment payload is a bug upstream.                                                                                                                                            |
| `approx-string-match.ts` | `approx-string-match` (Robert Knight, MIT)        | One function is needed. Upstream runs Myers' bit-parallel algorithm; this runs Sellers' dynamic programme with Ukkonen's cutoff, which can be checked against a brute-force reference.                                                                                                 |
| `match-quote.ts`         | Hypothesis client `match-quote.ts` (BSD-2-Clause) | Not published as a package. Two functions are needed, and an anchor that silently moves is the failure the whole cascade exists to avoid, so the scoring is ours to read and test.                                                                                                     |
| `fnv1a.ts`               | `@sindresorhus/fnv1a`                             | One function is needed. FNV-1a is a published standard rather than a library's invention, so the port can be checked against its own vectors; a reviewer's colour slot has to be the same number on every machine.                                                                     |
| `pkcs8.ts`               | the key-import half of `jose`                     | One function is needed. GitHub hands out an App's private key as PKCS#1 and `crypto.subtle.importKey` takes only PKCS#8, so the wrap is the whole of what a JOSE library would be for. `node:crypto` reads PKCS#1 directly and would end the route's promise that it runs on a Worker. |
| `source-map.ts`          | `@jridgewell/trace-mapping`, `source-map-js`      | One lookup is needed: a generated line and column to the original one, over the map a dev server serves inline. That is a VLQ decoder and a search over one line, written from the Source Map v3 spec; index maps are refused rather than half read.                                   |
