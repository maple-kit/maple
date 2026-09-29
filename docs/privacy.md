# What a comment carries from the page

A comment records where it was left so it can be found again, and part of that
is page text. It is stored in the draft, exported by **Copy**, and sent with the
comment to whatever store and forge the deployment uses.

## Quote text is page text

An anchor's `quote` has three parts, and all three are read from the rendered
page:

| Field    | What it is                                                        |
| -------- | ----------------------------------------------------------------- |
| `exact`  | The picked element's or passage's own text, up to 300 characters. |
| `prefix` | Up to 32 characters that precede it.                              |
| `suffix` | Up to 32 characters that follow it.                               |

Whatever the page shows there, the comment carries. A pick on a page that
renders a customer's order, an email address or a signed-in user's name will
store that text. Nothing removes it afterwards: a draft lives in `localStorage`
and a published comment lives in the store, so treat both as holding page text.

## What context does not reach

`prefix` and `suffix` are drawn from inside a boundary, not from the whole
document:

- The pick's `main` or `[role=main]`, when it sits in one.
- Otherwise the nearest tagged component around it (`data-maple-src` or
  `data-maple-name`).
- Otherwise the page.

Text under `nav`, `header`, `aside` and any element with `data-maple-private` is
left out of the context, unless the pick is inside that same element. A
sidebar's account menu therefore stays out of the comment, and a different
reviewer's name no longer makes the same comment score differently.

`exact` is the reviewer's own pick, so it is not filtered.

## What is not covered

- A pick inside an excluded element keeps that element's text, because the pick
  is the point of the comment.
- A page with no landmark and no tagged component still draws context from the
  document, minus the excluded elements above.
- There is no redaction hook yet. Text an app must never record belongs behind
  `data-maple-private`, which keeps it out of context but not out of `exact`.
