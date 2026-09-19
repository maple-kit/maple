/**
 * The same leaf, at avatar size, carrying initials instead of an address.
 *
 * Provenance is the whole of the signal: filled for an author the session
 * verified, translucent for one the application vouched for, outlined and
 * dashed for someone who typed a name. It is deliberately not a warning
 * triangle, and it never says the word "guest" at anybody.
 */

import { createElement, forwardRef, useCallback } from "react";

import { dataAttributes } from "../data.js";
import { composeRefs, Slot } from "../slot.js";
import { applyReviewerSlot } from "../slots.js";
import { inside, MapleLeaf } from "./shape.js";

import type { AsChildProps } from "../slot.js";
import type { IdentityProvenance } from "@maple-kit/core";
import type { HTMLAttributes } from "react";

/** One sentence per provenance, and none of them is a warning. */
const TOOLTIPS: Readonly<Record<IdentityProvenance, string>> = {
  server: "verified by the application's own session",
  client: "the application told us; unverified",
  guest: "typed a name into Maple",
};

/** Who wrote it, in their own colour. */
export interface AvatarProps extends AsChildProps, HTMLAttributes<HTMLSpanElement> {
  readonly name: string;
  readonly provenance?: IdentityProvenance;
  /** The reviewer colour, 0 to 9. */
  readonly colorSlot?: number;
}

/** The first letters of the first two words, which is what a name reduces to. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((word) => [...word][0]?.toUpperCase() ?? "").join("");
}

/** An author's leaf. The provenance is the fill; the name is beside it. */
export const MapleAvatar = /** @__PURE__ */ forwardRef<HTMLSpanElement, AvatarProps>(
  function MapleAvatar(props, ref) {
    const { asChild, children, className, colorSlot, name, provenance = "server", ...rest } = props;

    const paint = useCallback(
      (node: HTMLSpanElement | null) => {
        if (node && colorSlot !== undefined) applyReviewerSlot(node, colorSlot);
      },
      [colorSlot],
    );

    const Element = asChild ? Slot : "span";
    return createElement(
      Element,
      {
        ...rest,
        ...dataAttributes({ provenance }),
        title: `${name} — ${TOOLTIPS[provenance]}`,
        className: className ? `mk-avatar ${className}` : "mk-avatar",
        ref: composeRefs<HTMLSpanElement>(ref, paint),
      },
      ...inside(asChild, children, [
        createElement(MapleLeaf, {
          key: "leaf",
          form: provenance === "guest" ? "outline" : "solid",
          halo: false,
        }),
        createElement("span", { key: "ini", className: "mk-avatar-ini" }, initialsOf(name)),
      ]),
    );
  },
);
