---
"@maple-kit/ui": minor
---

Say less, and put the action in the sentence. Sign in and Try again in the notice, Try again in the failed-load state and Leave solo are inline links (`.mk-link`) rather than buttons, and "Sign in" is the first words of "Sign in before this deployment can show you its comments." The failed-load state loses its second line, and `ISLAND_COPY.unread` loses `line`. "Can't sign in?" moves out of the notice into the sign-in popup, where it opens the `maple solo` popup. The popup is now clickable: the overlay layer's `pointer-events: none` reached the dialog through the tree, so nothing inside it took a click.
