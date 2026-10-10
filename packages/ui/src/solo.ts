/**
 * `SoloOffer`: the words a guest is given when they cannot sign in.
 *
 * Drafts can be copied out, but a guest who is also the person running the
 * agent has a shorter road: `maple solo` keeps the comments on their machine.
 * Nothing here asks the machine anything. The overlay never probes localhost,
 * because every probe raises the browser's local-network prompt; the popup only
 * names a command, and the pairing arrives in a link that command prints.
 */

import { useMaple } from "@maple-kit/react";
import { createElement, Fragment, useState } from "react";

import { Popup } from "./popup.js";

import type { ReactElement } from "react";

/** The offer's words. */
export const SOLO_COPY = {
  trigger: "Can't sign in?",
  title: "Keep comments on your machine",
  body: "Run this in your project. It prints a link that pairs this page with your machine, and comments stay there instead of on this deployment.",
  command: "maple solo",
  copy: "Copy",
  copied: "Copied",
  gone: "The solo bridge on your machine did not answer. Run maple solo again for a new link.",
  leave: "Leave solo",
} as const;

/** How long the button says it copied. */
const COPIED_MS = 1600;

/** The command to paste, addressed to the page the guest is on. */
export function soloCommand(origin: string): string {
  return `${SOLO_COPY.command} ${origin}`;
}

/**
 * Drawn for a guest who is not paired, once the page has heard from the route,
 * as a link inside the sign-in popup. A reviewer who is signed in, or already
 * paired, is shown nothing.
 */
export function SoloOffer(): ReactElement | null {
  const { user, solo, phase } = useMaple();
  const [open, setOpen] = useState(false);
  if (user !== null || solo || (phase !== "ready" && phase !== "error")) return null;

  return createElement(
    Fragment,
    null,
    createElement(
      "button",
      { type: "button", className: "mk-link", onClick: () => setOpen(true) },
      SOLO_COPY.trigger,
    ),
    open ? createElement(SoloPopup, { onClose: () => setOpen(false) }) : null,
  );
}

function SoloPopup(props: { readonly onClose: () => void }): ReactElement {
  const [copied, setCopied] = useState(false);
  const command = soloCommand(globalThis.location.origin);

  const copy = (): void => {
    void navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => undefined,
    );
  };

  return createElement(
    Popup,
    { title: SOLO_COPY.title, onClose: props.onClose },
    createElement("p", null, SOLO_COPY.body),
    createElement(
      "div",
      { className: "mk-code-row" },
      createElement("code", { className: "mk-solo-command" }, command),
      createElement(
        "button",
        { type: "button", className: "mk-acct-do", onClick: copy },
        copied ? SOLO_COPY.copied : SOLO_COPY.copy,
      ),
    ),
  );
}
