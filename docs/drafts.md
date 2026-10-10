# A comment is a draft until it is published

Maple posted a comment the moment a reviewer pressed the button. That is the
shape almost every tool in this space has, and three things were wrong with it.

**A review is a pass over a page, not a single remark.** A reviewer walking a
preview finds four things, and posting them one at a time turns one review into
four notifications and four writes. With the pull-request ledger — one Maple
comment per pull request, which `docs/connectors.md` describes — it also turned
one repost into four.

**The failure copy promised somewhere that did not exist.** A refused send said
_"Your comment is kept here"_, and it was: `client/drafts.ts` has kept drafts
per branch in `localStorage` since the beginning, debounced, tombstoned and
expired after a week. Nothing in the interface ever showed one. A reviewer whose
store was down was told their comment was safe and given no way to look at it.

**A deployment with no store had nothing to offer at all.** Writing worked, the
send failed, and the comments were unreachable.

## The shape now

| Control           | Where             | What it does                                         |
| ----------------- | ----------------- | ---------------------------------------------------- |
| **Save as draft** | the composer      | Closes it. The comment waits, unsent.                |
| **Publish**       | the composer      | Sends every kept comment, this one included.         |
| **Sign in**       | the composer      | Replaces Publish until the reviewer has signed in.   |
| **Drafts** filter | the status select | Lists the unsent comments, drawn as any comment is.  |
| **Download**      | beside Import     | Every unsent comment as a file, never the clipboard. |
| **✕**             | a draft's row     | Throws that one away, without opening a panel.       |

Drafts are a status like the others: `drafts` is a value of the island's filter,
offered while there are any, and its rows are the same row a published comment
gets. Only a draft the reviewer kept counts: the comment being typed is stored
on every keystroke, but it is not in the filter, the count or the Download dot
until it is saved. A reviewer who has not signed in sees no Publish: Save as
draft is the primary button, "Sign in to publish directly" sits beside it, and
Download carries a green dot while a saved draft cannot be published.

## One publish is one write

`StoreConnector.appendMany` is the optional method behind **Publish all**. A
store that implements it takes the whole set in one write; one that does not
gets them one at a time from `CommentStore.appendMany`, which is the same
result and more calls. `githubStore` implements it as a single ledger repost, so four comments
are one comment on the pull request and one notification.

`POST /comments` therefore takes an object or an array. An array answers with
`{ comments }` and an object answers with the comment, because a binding that
sent one thing should not have to unwrap a list to find it.

## The guard is the whole argument

Batching only works if losing a batch is hard. A draft in `localStorage`
survives a reload and a crash and does **not** survive somebody closing the tab
and never coming back, because nobody else can see it.

So the guard saves before anything that could end the page, and attaches
`beforeunload` only while something would be lost by a reload: input in the open
composer, a save still inside its debounce window, or drafts held only in memory
because the browser blocks site data. A kept draft that has reached
`localStorage` is not at risk from a reload, so it does not ask, and a page
with only kept drafts keeps bfcache. `confirmOnUnload: false` turns the dialog
off for a host that would rather risk the rest.

A draft belongs to the route it was written on. Marks are placed only for drafts
whose recorded path matches the current one, ignoring host and query, because a
shared layout would otherwise let a draft from `/menu` land on `/roasts/huila`.
The Drafts list tags the others "On another page" and links to their path. Sent
comments are not filtered by route yet.

## Copy as markdown

`exportDrafts` writes the same markdown a published set produces: the table, and
the ` ```maple ` fence under it. Not a second format — an agent reading a
pasted block should not have to learn one.

The author is the one field a draft cannot have. Nothing has asked the route who
this is, and putting a name on something nobody signed would be a lie, so it is
the guest author, which is what the route would have assigned anyway.

## Moving drafts between browsers

Markdown cannot be read back, so **Download** saves a file
of the store's own shape: `{ version, branch, drafts }`, anchors, regions and page
context included, attachments by reference only. **Import drafts**, the upload icon beside the status select, takes a paste
or a dropped file, checks each entry with the same `isDraft` the store uses, and
saves through the draft keeper so the list updates without a reload. An id that
is already here, or that this branch sent, is skipped, so importing twice adds
nothing; a draft older than a week is turned away because the next load would
drop it; an entry that is not a draft is counted and reported. Each keeps its
original `updatedAt` and `context`. A file written on another branch asks first
and never re-keys silently.

## Drafts under another branch

The keeper reads exactly `maple:drafts:<branch>`, which is right, but a label
that changes under a reviewer looks like lost data. When the island opens it
scans the origin's other `maple:drafts:*` keys and, if one holds live drafts
(not expired, not sent), shows a quiet row: "3 drafts saved under `espresso-bar`"
with **Move here** and **Dismiss**. Move goes through the import path and empties
the old key. Nothing is merged automatically, and a dismissal holds until a
newer draft appears under that key.
