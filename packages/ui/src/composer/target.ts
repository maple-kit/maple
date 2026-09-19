/**
 * `Maple.Target`: what this comment is attached to, in words.
 *
 * The other half of what Maple has and a pin popover does not: it names the
 * thing. The rung, the confidence, the source line and the CSS path are
 * deliberately absent — they arrive with developer mode, at `data-mk-detail`.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { IconCrossfade } from "../icons/crossfade.js";
import { ElementIcon } from "../icons/element.js";
import { RegionIcon } from "../icons/region.js";
import { TextIcon } from "../icons/text.js";
import { Slot } from "../slot.js";
import { KIND_WORDS, quotedText, TARGET_PREFIX, targetName, targetPhrase } from "./phrase.js";

import type { AsChildProps } from "../slot.js";
import type { ComposerTarget, PickKind } from "@maple-kit/core/client";
import type { ReactElement } from "react";

/** The header. Takes `asChild` and nothing that changes its look. */
export interface MapleTargetProps extends AsChildProps {
  readonly className?: string;
}

/** Closing leaves the draft where it is. */
export const CLOSE_LABEL = "Close the composer";

/** Where developer detail lands next. Default until then. */
export const DETAIL_ATTRIBUTE = "data-mk-detail";

/** One module each, so a part drags in what it draws. */
function iconFor(kind: PickKind): ReactElement {
  if (kind === "text") return createElement(TextIcon, null);
  return kind === "region" ? createElement(RegionIcon, null) : createElement(ElementIcon, null);
}

/** Names the target and carries the close control. */
export const MapleTarget = /** @__PURE__ */ forwardRef<HTMLElement, MapleTargetProps>(
  function MapleTarget(props, ref) {
    const { composer } = useMaple();
    const client = useMapleClient();
    const Element = (props.asChild ? Slot : "header") as "header";

    return createElement(
      Element,
      {
        ref,
        className: props.className ? `mk-composer-head ${props.className}` : "mk-composer-head",
        "data-mk-detail": "default",
      },
      composer.target ? createElement(TargetLine, { target: composer.target }) : null,
      createElement("span", { className: "mk-composer-fill" }),
      createElement(
        "button",
        {
          type: "button",
          className: "mk-btn mk-btn-quiet mk-shut mk-hit mk-press",
          "aria-label": CLOSE_LABEL,
          onClick: () => client.closeComposer(),
        },
        "✕",
      ),
    );
  },
);

interface TargetLineProps {
  readonly target: ComposerTarget;
}

/**
 * The icon says the kind; the sentence says what it is on. The word beside the
 * icon read as a second fact, and the sentence already says which.
 */
function TargetLine(props: TargetLineProps): ReactElement {
  const { kind } = props.target;
  const quoted = quotedText(props.target);
  const phrase = quoted ?? targetPhrase(kind, targetName(props.target));

  return createElement(
    "span",
    { className: "mk-target" },
    createElement(
      "span",
      { className: "mk-target-kind", role: "img", "aria-label": KIND_WORDS[kind] },
      createElement(IconCrossfade, { name: kind, children: iconFor(kind) }),
    ),
    createElement(
      "span",
      { className: "mk-target-on" },
      TARGET_PREFIX,
      quoted === undefined
        ? createElement("b", null, phrase)
        : createElement("q", { className: "mk-target-quote" }, quoted),
    ),
  );
}
