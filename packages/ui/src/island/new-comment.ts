/**
 * `Maple.NewComment`: the island's bottom edge, and the whole of comment mode.
 *
 * Entering it has no chrome of its own — three picks under a muted label on the
 * card that is already here, rather than a second floating thing over the
 * preview. Arming one collapses the island, so the chrome gets out of the way
 * of the thing being picked.
 */

import { useMapleClient, usePicker } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { dataAttributes } from "../data.js";
import { ElementIcon } from "../icons/element.js";
import { RegionIcon } from "../icons/region.js";
import { TextIcon } from "../icons/text.js";
import { renderPart } from "../part.js";
import { useIsland } from "./context.js";
import { ISLAND_COPY, PICK_LABELS, pickTitle } from "./language.js";

import type { PartProps } from "../part.js";
import type { PickKind } from "@maple-kit/core/client";
import type { ReactNode } from "react";

/** The bar. Its children are the pick buttons. */
export interface NewCommentProps extends PartProps {
  readonly children?: ReactNode;
}

/** One pick. There is no fourth kind and no variant of these three. */
export interface PickButtonProps extends PartProps {
  readonly kind: PickKind;
  readonly children?: ReactNode;
}

const PART = "<Maple.PickButton>";

/** `NEW COMMENT`, and the three ways to start one. */
export const NewComment = /** @__PURE__ */ forwardRef<HTMLDivElement, NewCommentProps>(
  function NewComment(props, ref) {
    const { asChild, children, className, ...rest } = props;

    return renderPart("div", asChild, { ...rest, className: cx("mk-new", className), ref }, [
      renderPart(
        "span",
        false,
        { key: "label", className: "mk-new-label" },
        ISLAND_COPY.newComment,
      ),
      renderPart("div", false, { key: "picks", className: "mk-picks" }, children),
    ]);
  },
);

/** Arming one collapses the island; clicking the armed one disarms it. */
export const PickButton = /** @__PURE__ */ forwardRef<HTMLButtonElement, PickButtonProps>(
  function PickButton(props, ref) {
    const { asChild, children, className, kind, ...rest } = props;
    const island = useIsland(PART);
    const client = useMapleClient();
    const pick = usePicker();
    const armed = pick.armed && pick.kind === kind;

    const onClick = () => {
      if (armed) {
        client.disarm();
        return;
      }
      client.arm(kind);
      island.setOpen(false);
    };

    return renderPart(
      "button",
      asChild,
      {
        type: "button",
        ...dataAttributes({ armed }),
        ...rest,
        "aria-pressed": armed,
        className: cx("mk-pick mk-hit", className),
        title: pickTitle(kind),
        onClick,
        ref,
      },
      children ?? [createElement(icon(kind), { key: "icon" }), PICK_LABELS[kind]],
    );
  },
);

function icon(kind: PickKind) {
  if (kind === "text") return TextIcon;
  return kind === "region" ? RegionIcon : ElementIcon;
}
