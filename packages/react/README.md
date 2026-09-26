# @maple-kit/react

React bindings for [Maple](https://github.com/maple-kit/maple)'s reviewer
controller. Hooks and nothing else — no DOM, no styles, no components.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Install

```sh
npm install @maple-kit/react
```

`react` is a peer dependency.

## When to use it

[`@maple-kit/ui`](../ui) is the overlay Maple draws. This package is the state
underneath it, for an application that wants to render review comments in its
own design system and pull in none of `@maple-kit/ui`.

```tsx
import { MapleProvider, useComments, useMapleClient } from "@maple-kit/react";

function ReviewList() {
  const comments = useComments("open");
  const client = useMapleClient();
  return (
    <ul>
      {comments.map((comment) => (
        <li key={comment.id} onClick={() => client.select(comment.id)}>
          {comment.body}
        </li>
      ))}
    </ul>
  );
}

<MapleProvider options={{ branch: "feat/checkout" }}>
  <ReviewList />
</MapleProvider>;
```

## What is in it

`MapleProvider` plus `useSyncExternalStore` bindings over the controller in
`@maple-kit/core/client`, each as narrow as the component that reads it:

| Hook               | What it returns                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| `useMaple()`       | The whole state. Re-renders on every change.                                      |
| `useMapleClient()` | The controller, for `setFilter`, `arm`, `publish` and the rest. Never re-renders. |
| `useComments()`    | The comments a filter shows, in render order.                                     |
| `useComposer()`    | The composer, open or closed, with its body, attachments and dirtiness.           |
| `usePicker()`      | Whether a pick is armed, and which kind.                                          |
| `useAnchor(id)`    | The anchor behind a comment, a draft, or the open composer.                       |
| `useDraft(id?)`    | The draft the composer is writing into, or the one with the given id.             |
| `useGitHubLink()`  | The reviewer's GitHub link, or `unsupported` when the route has no sign-in.       |

`@maple-kit/react/mock` is `useMock()`, one subscription over
[Maple Mock](../mock)'s box controller in `@maple-kit/mock/client`.

The state machine lives one level below, in core, deliberately: a React hook is
not portable, and a controller is.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
