# The overlay under a host modal

A modal `<dialog>` opened with `showModal()` sits in the top layer above any
`z-index` and makes the rest of the document inert. A script-built modal
(`role="dialog" aria-modal="true"`) typically adds a focus trap and closes on
any `pointerdown` outside it. Left in `<body>`, the overlay would be hidden,
unfocusable, and counted as an outside click.

While a modal is open the overlay's host element is moved inside the topmost
one, and moved back to where it was mounted when none is left
(`packages/core/src/overlay/modal.ts`). Inside the modal the host is not inert,
is in the top layer with it, and is contained by it, so a click on Maple is not
an outside click. The shadow root, state and the focused control survive the
move; an open Maple popup is re-opened as modal.

## What it detects

- Native: `dialog:modal`, the last one in document order.
- Scripted: `[role="dialog"]` or `[role="alertdialog"]` with
  `aria-modal="true"`, connected and visible. A native modal wins over a
  scripted one.

It re-checks when `open`, `aria-modal`, `role`, `hidden`, `style` or `class`
change on a modal or on an ancestor of the overlay, when a node mentioning a
dialog is added or removed, and on a dialog's `close` and `cancel`.

## Limits

- The host is `position: fixed` and covers the viewport. If the modal, or an
  ancestor of it, has `transform`, `filter`, `perspective`, `contain: paint`
  or `will-change` naming one of those, that becomes the containing block of
  fixed descendants and the overlay is sized and clipped to it. A native
  modal has none of these by default; a library's animated one may.
- A modal that renders into a closed shadow root cannot be seen.
- Escape inside a host modal still closes Maple's composer too.
