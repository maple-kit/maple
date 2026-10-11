/**
 * `Maple.Attachments`: the screenshot, and the two ways to replace it.
 *
 * A capture is taken at pick time and lands here on its own, so the usual case
 * needs no control. Paste and drop override it, and the panel already listens
 * for both. The image stays in memory until the comment is published, which is
 * when it is uploaded. A capture that failed and a deployment with nowhere to
 * keep one are said out loud: each looked like a tool with no screenshots.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useEffect, useState } from "react";

import { SparkleIcon } from "../icons/sparkle.js";
import { useShots } from "../shots.js";
import { Slot } from "../slot.js";
import { useComposerScope } from "./scope.js";

import type { AsChildProps } from "../slot.js";
import type { ComposerScopeValue } from "./scope.js";
import type { MediaRef } from "@maple-kit/core";
import type { PastedImage } from "@maple-kit/core/screenshot";
import type { ReactElement, ReactNode } from "react";

/** The strip. Both seams default to the route, and are overrides, not options. */
export interface MapleAttachmentsProps extends AsChildProps {
  readonly className?: string;
  /**
   * Puts the image wherever blobs live and returns the ref a comment keeps,
   * when the comment is published. Defaults to `POST /media` on the route.
   */
  readonly upload?: (image: PastedImage) => Promise<MediaRef>;
  /**
   * Turns a stored comment's media reference into something an `img` loads.
   * Defaults to the route's own redirect. A `MediaRef` is never a URL.
   */
  readonly resolve?: (ref: MediaRef) => string | undefined;
}

/** Where `media` on the route is explained. */
export const SCREENSHOT_DOCS = "https://github.com/maple-kit/maple/blob/main/docs/screenshots.md";

/** Every word this part shows, spelled once. */
export const ATTACH_WORDS = {
  hint: "Paste or drop an image to attach one",
  taken: "Taken of the page when you picked",
  remove: "Remove",
  alt: "Screenshot attached to this comment",
  kept: "A screenshot was attached when this was sent",
  nowhere: "This deployment keeps no screenshots \u2014 turn on ",
  nowhereLink: "screenshot storage",
  nowhereEnd: " to attach them.",
  uncaptured: "Maple could not take a screenshot. Paste or drop one instead.",
} as const;

/** The screenshot, before and after it is attached. */
export const MapleAttachments = /** @__PURE__ */ forwardRef<HTMLElement, MapleAttachmentsProps>(
  function MapleAttachments(props, ref) {
    const scope = useComposerScope("Maple.Attachments");
    const { composer, media, phase } = useMaple();
    const client = useMapleClient();
    const resolve = props.resolve ?? ((one: MediaRef) => client.mediaUrl(one));

    const claimed = useClaimed(scope);
    useOverride(scope, props.upload);
    const Element = (props.asChild ? Slot : "div") as "div";

    const className = ["mk-composer-row", "mk-shots", props.className].filter(Boolean).join(" ");
    if (composer.viewing !== undefined) {
      return kept({ className, attachments: composer.attachments, resolve }, ref);
    }

    const captured = scope.pending?.source === "capture";
    // `/me` is asked alongside the list, so a load that failed still answered
    // this. Only an unasked route is unknown, and that is the one grey case.
    const asked = phase === "error" || phase === "ready";
    const keeps = media || !asked;
    if (!keeps) {
      const note = ["mk-composer-row", "mk-note", props.className].filter(Boolean).join(" ");
      return createElement(Element, { ref, className: note }, ...nowhere());
    }
    const children = scope.pending
      ? filled(scope, captured)
      : [said(resting(claimed), false, "said")];

    return createElement(
      Element,
      { ref, className, ...(captured ? { "data-mk-maple": "true" } : {}) },
      ...children,
    );
  },
);

/** A deployment with nowhere to put one gets a note, never a thumbnail: a
 * picture of something about to be dropped, with a control to drop it. */
function nowhere(): ReactNode[] {
  return [
    ATTACH_WORDS.nowhere,
    createElement(
      "a",
      { key: "docs", href: SCREENSHOT_DOCS, target: "_blank", rel: "noopener noreferrer" },
      ATTACH_WORDS.nowhereLink,
    ),
    ATTACH_WORDS.nowhereEnd,
  ];
}

/** Silence is a lie where a capture was attempted and failed. */
function resting(claimed: Claimed): string {
  return claimed === "failed" ? ATTACH_WORDS.uncaptured : ATTACH_WORDS.hint;
}

/**
 * One kept attachment: the image where it can be loaded, a line where not, and
 * either way the sentence saying whether Maple took it or the author did.
 */
function shot(one: MediaRef, resolve: Resolve): readonly ReactElement[] {
  const src = resolve(one);
  const byMaple = one.source === "capture";
  const words = byMaple ? ATTACH_WORDS.taken : ATTACH_WORDS.kept;

  return [
    ...(src === undefined
      ? []
      : [
          createElement("img", {
            key: `${one.key}-img`,
            className: "mk-shot",
            src,
            alt: ATTACH_WORDS.alt,
          }),
        ]),
    said(words, byMaple, one.key),
  ];
}

type Resolve = (ref: MediaRef) => string | undefined;

interface KeptProps {
  readonly className: string;
  readonly attachments: readonly MediaRef[];
  readonly resolve: Resolve;
}

function kept(props: KeptProps, ref: React.ForwardedRef<HTMLElement>): ReactElement {
  if (props.attachments.length === 0) return createElement("div", { ref, hidden: true });
  const byMaple = props.attachments.some((one) => one.source === "capture");

  return createElement(
    "div",
    { ref, className: props.className, ...(byMaple ? { "data-mk-maple": "true" } : {}) },
    ...props.attachments.flatMap((one) => shot(one, props.resolve)),
  );
}

/** The thumbnail, where it came from, and the control that takes it off. */
function filled(scope: ComposerScopeValue, captured: boolean): ReactNode[] {
  return [
    createElement("img", {
      key: "shot",
      className: "mk-shot",
      src: scope.pending?.preview.url,
      alt: ATTACH_WORDS.alt,
    }),
    createElement(
      "span",
      { key: "body", className: "mk-shot-body" },
      said(taking(captured), captured, "said", "mk-shot-said mk-shot-line"),
    ),
    createElement(
      "button",
      {
        key: "off",
        type: "button",
        className: "mk-btn mk-btn-quiet mk-press",
        onClick: scope.clear,
      },
      ATTACH_WORDS.remove,
    ),
  ];
}

/**
 * The sparkle marks the one Maple took by itself, in the one warm colour: a
 * reviewer did everything else here, and this happened without them.
 */
function said(
  words: string,
  byMaple: boolean,
  key: string,
  className = "mk-shot-said",
): ReactElement {
  return createElement(
    "span",
    { key, className, ...(byMaple ? { "data-mk-maple": "true" } : {}) },
    byMaple ? createElement(SparkleIcon, { key: "spark", size: 12 }) : null,
    createElement("span", { key: "words", className: "mk-shot-words" }, words),
  );
}

function taking(captured: boolean): string {
  return captured ? ATTACH_WORDS.taken : ATTACH_WORDS.hint;
}

/** Nothing claimed yet, an image claimed, or a capture that did not work. */
type Claimed = "failed" | "none" | "taken";

/** Claims whatever the picker left, once, image or failure alike. */
function useClaimed(scope: ComposerScopeValue): Claimed {
  const shots = useShots();
  const [claimed, setClaimed] = useState<Claimed>("none");
  const offered = scope.offer;

  useEffect(() => {
    if (!shots) return;
    const claim = (): void => {
      const shot = shots.get() ? shots.take() : undefined;
      if (!shot) return;
      if (shot.status === "taken") offered(shot.image, "capture");
      setClaimed(shot.status);
    };

    claim();
    return shots.subscribe(claim);
  }, [offered, shots]);

  return claimed;
}

/**
 * Hands the application's own upload to the scope, which reads it when an
 * image is held. The route's media endpoint is the controller's default.
 */
function useOverride(scope: ComposerScopeValue, upload: MapleAttachmentsProps["upload"]): void {
  useEffect(() => {
    scope.upload.set(upload);
  }, [scope.upload, upload]);
}
