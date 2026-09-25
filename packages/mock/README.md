# @maple-kit/mock

The runtime behind Maple Mock: a page's API responses, rewritten into the state
a reviewer asked to see — empty, error, forbidden, loading, one item or many.

`docs/mock.md` in this repository is the design record.

## Status

The recipe and where it is kept exist. The interceptor, the REST and tRPC
codecs and the transforms do not yet; `@maple-kit/mock/install`,
`@maple-kit/mock/msw` and `@maple-kit/mock/node` are empty entries until they
do.

## The recipe

A mock is a small record, validated by `parseRecipe` from
`@maple-kit/core/mock`:

```ts
{ version: 1, calls: [{ key: "trpc:project.list", state: "empty" }] }
```

A call it does not name passes through untouched. Applying a mock reloads the
page with the recipe in `sessionStorage` and in the `?maple-mock=` parameter, so
a link reproduces it:

```ts
import { linkRecipe, saveRecipe } from "@maple-kit/mock";

saveRecipe(sessionStorage, recipe);
location.assign(linkRecipe(location.href, recipe));
```

## Entries

| Entry                     | What it is                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| `@maple-kit/mock`         | Reading and writing the recipe: link, tab, encode, decode.       |
| `@maple-kit/mock/install` | The in-page transport, imported first from the app's entry.      |
| `@maple-kit/mock/msw`     | Handlers for a host that already runs MSW's `setupWorker`.       |
| `@maple-kit/mock/node`    | The same handlers for `setupServer` in tests or a server render. |

This package uses no React, no Effect and no model. `@maple-kit/ui` and
`@maple-kit/react` import it; it never imports them.
