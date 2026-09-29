/**
 * `Maple.Attachments`: the screenshot, and the two ways to replace it.
 *
 * A capture is taken at pick time and lands here on its own, so the usual case
 * needs no control. Paste and drop override it, and the panel already listens
 * for both. Everything that can go wrong here is said out loud: a capture that
 * failed, an upload that failed, and a deployment with nowhere to keep one at
 * all — three silences that each looked like a tool with no screenshots in it.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useEffect, useRef, useState } from "react";

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
   * Puts the image wherever blobs live and returns the ref a comment keeps.
   * Defaults to `POST /media` on the route, served by its media connector.
   */
  readonly upload?: (image: PastedImage) => Promise<MediaRef>;
  /**
   * Turns a stored comment's media reference into something an `img` loads.
   * Defaults to the route's own redirect. A `MediaRef` is never a URL.
   */
  readonly resolve?: (ref: MediaRef) => string | undefined;
}

/** Every word this part shows, spelled once. */
export const ATTACH_WORDS = {
  hint: "Paste or drop an image to attach one",
  taken: "Taken of the page when you picked",
  remove: "Remove",
  alt: "Screenshot attached to this comment",
  kept: "A screenshot was attached when this was sent",
  failed: "That image could not be attached.",
  nowhere: "This deployment keeps no screenshots, so one cannot be attached.",
  notKept: "This deployment keeps no screenshots, so this one will not be sent.",
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
    const failed = useUpload(scope, media, props.upload);
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
    const children = scope.pending
      ? filled(scope, { failed, captured, keeps })
      : [said(resting(keeps, claimed), false, "said")];

    return createElement(
      Element,
      { ref, className, ...(captured ? { "data-mk-maple": "true" } : {}) },
      ...children,
    );
  },
);

/** "Paste or drop one" is a lie where there is nowhere to put it, and silence
 * is a lie where a capture was attempted and failed. */
function resting(keeps: boolean, claimed: Claimed): string {
  if (!keeps) return ATTACH_WORDS.nowhere;
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

/** What the strip is saying about the one image it is holding. */
interface Held {
  readonly failed: boolean;
  readonly captured: boolean;
  /** False and the thumbnail is a picture of something about to be dropped. */
  readonly keeps: boolean;
}

/** The thumbnail, where it came from, and the control that takes it off. */
function filled(scope: ComposerScopeValue, held: Held): ReactNode[] {
  const { captured, failed, keeps } = held;
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
      said(taking(held), captured && keeps, "said", "mk-shot-said mk-shot-line"),
      failed
        ? createElement("span", { key: "bad", className: "mk-chip" }, ATTACH_WORDS.failed)
        : null,
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

/** A thumbnail over a deployment that keeps none is a picture of something
 * about to be dropped, and used to say "taken of the page when you picked". */
function taking(held: Held): string {
  if (!held.keeps) return ATTACH_WORDS.notKept;
  return held.captured ? ATTACH_WORDS.taken : ATTACH_WORDS.hint;
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
 * Uploads what was offered, through the route unless the application replaced
 * the seam. Nothing is attempted where the deployment keeps no screenshots.
 */
function useUpload(
  scope: ComposerScopeValue,
  media: boolean,
  upload: MapleAttachmentsProps["upload"],
): boolean {
  const client = useMapleClient();
  const sent = useRef<PastedImage>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const image = scope.pending?.image;
    const put = upload ?? (media ? routed(client) : undefined);
    if (!image || !put || sent.current === image) return;

    sent.current = image;
    const source = scope.pending?.source ?? "offered";
    let live = true;
    const done = (ref: MediaRef): void => {
      if (live) client.attach({ ...ref, source });
    };
    const broke = (): void => {
      if (live) setFailed(true);
    };

    void put(image).then(done, broke);
    return () => {
      live = false;
    };
  }, [scope.pending, upload, media, client]);

  return failed;
}

/** The default seam: the route's own media endpoint, on the same origin. */
function routed(client: ReturnType<typeof useMapleClient>) {
  return (image: PastedImage) => client.uploadMedia(image.blob, image.type);
}
