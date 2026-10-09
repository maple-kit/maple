---
"@maple-kit/ui": minor
---

Rework the sign-in surfaces. Pressing Sign in now opens a popup with numbered steps: copy the code, open GitHub, and a waiting line that closes itself when GitHub confirms; `SignIn` is exported from `@maple-kit/ui/island` and mounted by `<Maple>`. "Can't sign in?" is now a link inside the notice sentence that opens a popup with the `maple solo` command; `SOLO_COPY` loses `before`, `after` and `hint` and gains `trigger`, `title`, `body` and `copy`, and `SoloOffer` is inline text rather than a paragraph. The notice's dismiss button is the island header's close button, so both sit at the same offset and size. A linked account reads "Linked • username", and Unlink is drawn in the new `--mk-danger` colour and aligned right.
