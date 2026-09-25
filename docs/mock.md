# Mock: showing a page in the state a reviewer asked for

The states that most need a visual review are the hardest to reach on a
preview: empty, error, forbidden, loading, one item, a thousand items. Maple
Mock lets a reviewer name the state, and rewrites the page's API responses into
it. The tracking issue is #166; the open questions are in Discussion #174.

This file records decisions as they land. It says what exists, not what is
planned.

## A model picks, code writes every byte

A model may be asked which state was meant and which calls it concerns. It is
never asked to write a response body. A transform reshapes a response the page
has already received, or one sampled from its schema, so the app's own parser
still accepts the result. A generated payload would be valid only by luck.

Nothing in the runtime calls a model.

## Where the pieces live

| Piece                                           | Home                   |
| ----------------------------------------------- | ---------------------- |
| The recipe type and its validator               | `@maple-kit/core/mock` |
| Interceptor, codecs, transforms, recipe storage | `@maple-kit/mock`      |

**A package, not a core subpath.** The interceptor is imported from a host's
entry before its first request, and a host that does not mock should not carry
it. A host that only mocks installs `@maple-kit/mock` and never loads the review
overlay.

**The recipe type is in core** because the comment fence will carry it, and the
fence is core's. The writer and the reader of a format share one validator and
ship in one release, which is the lesson of a reader pinned to an older core
that read a newer format and passed.

**`@maple-kit/mock` has no React and no Effect**, and never imports
`@maple-kit/ui` or `@maple-kit/react`. They depend on it through their own
`./mock` subpaths. A lint rule enforces the direction.

## The recipe

```ts
{
  version: 1,
  calls: [{ key: "trpc:project.list", state: "empty" }],
  request: "mock this page with an empty state",
}
```

- **A call is named by a key its codec owns**, prefixed with the codec's name:
  `rest:GET /api/projects/:id`, `trpc:project.list`. Core checks only the
  prefix; the grammar after the colon is the codec's.
- **A call not named passes through.** A mock is a list of exceptions to the
  real server, never a replacement for it. Mutations are no different: one is
  mocked only if the recipe names it.
- **The states are a closed set**: `empty`, `error`, `forbidden`, `loading`,
  `one`, `many`. A state outside it is refused rather than ignored, since a
  recipe that silently mocks less than it says is worse than one that fails.
- **Unknown fields are dropped, a newer version is refused.** Dropping lets a
  later layer be added to the record without an older reader rejecting it.
  Refusing a newer version stops a reader half-applying a format it does not
  know.
- **`request` is the reviewer's words**, kept for display. Nothing reads it to
  decide what to mock.

`parseRecipe` returns a fresh copy and throws `InvalidRecipeError` listing
every problem at once.

## Applying a mock reloads the page

The recipe is written to `sessionStorage` and to the `?maple-mock=` parameter,
and the page reloads. Patching a client's query cache in place would mean one
integration per data library, each of them fragile; a reload makes every
library fetch again through the interceptor.

- **The link wins over the tab.** Opening a shared link shows what was shared,
  even in a tab that had another mock on.
- **The tab keeps it through navigation** that drops the query string.
- **The parameter is base64url of the JSON**, so it survives any router that
  re-encodes the query.

`readRecipe` throws on a recipe it cannot read rather than returning nothing,
so the caller decides whether to drop it. A broken link that silently shows
real data looks exactly like a working mock of a page with real data.
