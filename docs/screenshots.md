# Screenshots

A comment about a layout is worth much less without a picture of the layout. So
Maple takes one at pick time, without being asked, and the reviewer can replace
it by pasting or dropping another.

None of that is worth anything if the image has nowhere to go, and for the first
two releases it did not: `MediaConnector` was a contract with no route behind
it, and `Maple.Attachments` only attached an image when the host application
passed it an `upload` function. A default installation showed the reviewer a
thumbnail and then dropped it. This file is the path now.

## The path an image takes

| Step                           | Where                                 |
| ------------------------------ | ------------------------------------- |
| Captured when the pick commits | `core/screenshot`, through the picker |
| Handed to the strip            | `ui/shots`, one slot, one composer    |
| Held while it is a draft       | memory, per draft: `client.holdImage` |
| Uploaded when published        | `POST {base}/media`                   |
| Kept                           | the route's `MediaConnector`          |
| Referenced on the comment      | `Comment.attachments`, a `MediaRef`   |
| Read back                      | `GET {base}/media/{key}?type=…`       |

## When it is uploaded

An image is uploaded when its comment is **published**, never when it is
attached. While the comment is a draft the image is a blob in memory, previewed
through a `blob:` URL, and the strip makes no request at all. `client.publish()`
uploads the image of each draft it sends, one after another, and only then posts
the comments with the returned `MediaRef`s.

- **Removing the image, or discarding the draft, uploads nothing**, so a
  reviewer who changes their mind leaves nothing in the bucket.
- **A failed upload fails the publish.** Nothing is posted, the draft and its
  image stay where they were, and the panel says the screenshot could not be
  uploaded (`MapleFailure.during` is `"upload"`). Publishing again retries, and
  an image that already uploaded is not uploaded twice.
- **The image is not saved with the draft.** Drafts are kept in `localStorage`
  and a blob is not, so the image survives closing the panel and switching
  drafts, but not a reload: the words come back and the image does not. Publish
  before reloading, or paste it again.

A `MediaRef` is a connector name, a key and a content type. It is never a URL:
a URL is minted per read, because the ones a real blob store hands out are
signed and expire, and a comment outlives them.

## Wiring it

One connector on the route, and nothing in the overlay:

```ts
createMapleHandler({ store, media: s3Media({ bucket: "maple-previews" }) });
```

`media` takes a resolver as well as a connector, the same way `store` does, so
the credential can be the reviewer's rather than the deployment's.

`Maple.Attachments` still takes `upload` and `resolve`, but they are **overrides
now, not requirements**: without them the route is where an image is published
to and read back from. `upload` is called when the comment is published.

## Reading an image back

`GET {base}/media/{key}` asks the connector for a URL and **redirects** to it.
It does not stream the bytes: a signed URL is the point of `getUrl`, and
proxying every screenshot would put them all on the application's own budget.

The one exception is a `data:` URL, which the route decodes and serves instead,
because a browser refuses to follow a redirect to one. Only a development
connector answers with one — `memoryMedia` in `@maple-kit/core/testing` does,
which is how the Vite example shows the whole path without a bucket.

## Where it shows on the pull request

`exportMarkdown` takes a `screenshots` map of comment id to URL and gives the
table a **Shot** column. `githubStore` fills it from `GitHubStoreOptions.media`:
given a media connector, it resolves the comment's first image attachment and
links it. Given none, the ref stays in the fence and the column is absent —
there is no half-link.

Two rules shape this, and both were established by posting to a real repository
rather than by reading the documentation:

- **A `data:` image is stripped.** GitHub's sanitiser returns `<img alt="shot">`
  with no `src` at all, so `exportMarkdown` drops anything that is not
  `http(s)`. `memoryMedia` therefore produces no Shot column, which is correct:
  it has nothing GitHub could fetch.
- **An `https:` image is proxied through camo**, meaning GitHub's own servers
  fetch it. A URL only a signed-in reviewer can load — an auth-gated preview,
  or anything on `localhost` — renders as a broken image on the pull request.
  The blob store has to be publicly readable, or the link is worth nothing.

And one rule that follows from the connector contract rather than from GitHub:
**do not hand `githubStore` a connector whose `getUrl` is a signed, expiring
URL.** That is what most of them are — it is why `getUrl` exists at all, and
why the media route redirects rather than writing a URL down. A comment
outlives a presign by months. The durable form of the link is Maple's own
`GET {base}/media/{key}`, which mints a fresh one on every read, so a
deployment behind a real blob store passes the store a connector that returns
_that_ rather than the connector it gave the route.

A media connector that cannot answer costs the table its link and nothing more.
The comment still posts and the fence still carries the `MediaRef`, because
losing a reviewer's comment over a screenshot is the worse of the two failures.

## When there is no screenshot

There are three ways not to have one, they are not the same thing, and all
three used to render as the same grey line asking for a paste — which reads as
a tool that never took screenshots at all.

1. **The deployment keeps none.** `GET /me` reports `media: false` and the strip
   says so. Offering a paste would be a lie: there would be nowhere to put it.
2. **The capture failed.** The strip says a capture was tried and asks for a
   paste instead. The usual cause is the next section.
3. **Nothing has happened yet.** The ordinary resting state, and the only one
   that asks for a paste.

A fourth, which is the same lie in a different place: a deployment that keeps
none can still _capture_, so the strip would show a thumbnail and say "taken of
the page when you picked" about an image that goes nowhere. It says that one
will not be sent instead.

## snapdom is optional, and that is a real choice

`captureElement` imports [`@zumer/snapdom`](https://github.com/zumerlab/snapdom)
dynamically, and it is an **optional** peer dependency. An application that does
not install it gets paste and drop and no capture.

It stays optional because it is 550 KB unpacked for a transform a server-only
use of `@maple-kit/core/route` will never reach, and because the import is
dynamic, so nothing loads until a pick commits. What changed is that skipping it
is no longer silent: the failure reaches the strip and says what happened.

Install it where a capture is wanted:

```
npm install @zumer/snapdom
```

## Why paste is still first

snapdom re-renders the DOM; it does not read the compositor. A cross-origin
image, a canvas, a video frame and anything the GPU drew come out wrong or
blank — which is precisely the set of things people leave comments about. A
pasted image is the reviewer's own screenshot of what they actually saw, so it
always wins over a capture, and the panel listens for a paste and a drop
whether or not a capture arrived.

`CaptureUnavailableError` is thrown rather than a blank image being returned,
for the same reason: a blank screenshot attached to a comment looks like
evidence.
