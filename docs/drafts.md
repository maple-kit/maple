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

| Control             | Where           | What it does                                        |
| ------------------- | --------------- | --------------------------------------------------- |
| **Keep**            | the composer    | Closes it. The comment waits, unsent.               |
| **Publish**         | the composer    | Sends every kept comment, this one included.        |
| **Publish all _n_** | the unsent list | The same, from the island.                          |
| **Copy**            | the unsent list | Every unsent comment as markdown, to the clipboard. |
| **✕**               | an unsent row   | Throws that one away, without opening a panel.      |

`Maple.Unsent` draws nothing while nothing is waiting, so a reviewer who
publishes as they go never sees it.

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

So `beforeunload` is attached whenever anything is unpublished — a comment
being typed, or one merely kept — rather than only while the composer is dirty,
and `confirmOnUnload` now defaults to on. The browser's own dialog is not
pretty and it is the only thing that fires on a tab close. `confirmOnUnload:
false` turns it off for a host that would rather risk it.

It costs bfcache on a page with unsent comments and nothing on a page without,
because the listener is attached and removed as drafts come and go.

## Copy as markdown

`exportDrafts` writes the same markdown a published set produces: the table, and
the ` ```maple ` fence under it. Not a second format — an agent reading a
pasted block should not have to learn one.

The author is the one field a draft cannot have. Nothing has asked the route who
this is, and putting a name on something nobody signed would be a lie, so it is
the guest author, which is what the route would have assigned anyway.
