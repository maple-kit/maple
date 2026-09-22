---
"@maple-kit/core": minor
---

One Maple comment per pull request, reposted rather than edited.

`githubStore` wrote one issue comment per visual comment. Ten comments were ten
comments on the pull request, and the review underneath them was unreadable.
Everything Maple keeps now lives in one ledger comment: a table of every visual
comment, the sign-offs under it, and one fence holding all of them.

Collapsing them costs the notification an edit does not send, so a write that
is news — a new comment, a new approval — posts the rebuilt ledger and deletes
the old one, landing at the bottom of the thread. A resolve or a withdrawal
edits in place, because announcing what a reviewer just clicked is noise. The
new comment is created before the old one is deleted: the other order loses
every comment if the process dies between the two calls.

**Breaking:** a comment id is now `gh_<pull>_<n>`, where `n` is a per-pull
sequence rather than the issue comment's own id — the ledger's id changes on
every repost, so an id built from it would not survive one. Ids written by an
earlier version no longer resolve. `ParsedFence` gains `approvals`,
`ExportOptions` gains `approvals`, and the markdown table gains a `Status`
column once any comment is not open.
