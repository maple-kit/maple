/**
 * `SoloOffer`: the one line a guest is given when they cannot sign in.
 *
 * Drafts can be copied out, but a guest who is also the person running the
 * agent has a shorter road: `maple solo` keeps the comments on their machine.
 * Nothing here asks the machine anything. The overlay never probes localhost,
 * because every probe raises the browser's local-network prompt; the line only
 * names a command, and the pairing arrives in a link that command prints.
 */

import { useMaple } from "@maple-kit/react";
import { createElement, useState } from "react";

import type { ReactElement } from "react";

/** The offer's words. */
export const SOLO_COPY = {
  before: "Can't sign in? Run ",
  command: "maple solo",
  after: " to keep comments on your machine",
  hint: "Copy the command",
  copied: "Copied",
  gone: "The solo bridge on your machine did not answer. Run maple solo again for a new link.",
  leave: "Leave solo",
} as const;

/** How long the line says it copied. */
const COPIED_MS = 1600;

/** The command to paste, addressed to the page the guest is on. */
export function soloCommand(origin: string): string {
  return `${SOLO_COPY.command} ${origin}`;
}

/**
 * Drawn for a guest who is not paired, once the page has heard from the route.
 * A reviewer who is signed in, or already paired, is shown nothing.
 */
export function SoloOffer(): ReactElement | null {
  const { user, solo, phase } = useMaple();
  const [copied, setCopied] = useState(false);
  if (user !== null || solo || (phase !== "ready" && phase !== "error")) return null;

  const copy = (): void => {
    const command = soloCommand(globalThis.location.origin);
    void navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => undefined,
    );
  };

  return createElement(
    "p",
    { className: "mk-solo" },
    SOLO_COPY.before,
    createElement(
      "button",
      { type: "button", className: "mk-solo-command", title: SOLO_COPY.hint, onClick: copy },
      SOLO_COPY.command,
    ),
    SOLO_COPY.after,
    copied
      ? createElement(
          "span",
          { role: "status", className: "mk-solo-copied" },
          ` · ${SOLO_COPY.copied}`,
        )
      : null,
  );
}
