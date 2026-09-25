---
"@maple-kit/mock": minor
---

**`@maple-kit/mock` mocks tRPC**, batched, streamed and with superjson.

`trpcCodec({ endpoint, transformer })` is a default codec, before REST, at
`/api/trpc`. `/api/trpc/a,b?batch=1` is two calls, `trpc:a` and `trpc:b`. A
partial mock sends the real batch and replaces only the named calls, leaving
the rest byte for byte and recomputing a 207. A `httpBatchStreamLink` batch is
fetched plain and written back as tRPC's own JSONL. superjson annotations stay
true through `empty`, `one` and `many`.

The `Codec` contract gains an optional `prepare(request)`, and an `Answer` an
optional `meta`. `reshapeTyped` is new beside `reshape`.
`installMock` takes `codecs`.
