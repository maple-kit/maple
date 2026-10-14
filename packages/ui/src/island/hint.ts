/**
 * `Maple.IslandHint`: why a tap of the comment key did nothing.
 *
 * Only a focused text field does that, and silence reads as a broken key.
 */

import { useMaple } from "@maple-kit/react";
import { forwardRef } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { tapHint } from "./language.js";

import type { PartProps } from "../part.js";

/** One short line above the pill, only while a swallowed tap is explained. */
export const IslandHint = /** @__PURE__ */ forwardRef<HTMLDivElement, PartProps>(
  function IslandHint(props, ref) {
    const { asChild, className, ...rest } = props;
    const { tap } = useMaple();

    if (!tap.hint) return null;

    return renderPart(
      "div",
      asChild,
      { ...rest, role: "status", className: cx("mk-tap-hint", className), ref },
      tapHint(),
    );
  },
);
