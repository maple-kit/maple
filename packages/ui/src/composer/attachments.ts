/**
 * `Maple.Attachments`: the screenshot, and the two ways to replace it.
 *
 * A capture is taken at pick time and lands here on its own, so the usual
 * case needs no control. Paste and drop override it, and the panel already
 * listens for both — a button would be a third path to something that
 * arrived before anyone looked. Client capture re-renders the DOM, so it is
 * wrong on the details people comment about; a pasted image always wins.
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

/** The strip. `upload` is a seam, not a variant. */
export interface MapleAttachmentsProps extends AsChildProps {
  readonly className?: string;
  /** Puts the image wherever blobs live and returns the ref a comment keeps. */
  readonly upload?: (image: PastedImage) => Promise<MediaRef>;
  /**
   * Turns a stored comment's media reference into something an `img` loads. A
   * `MediaRef` is a connector and a key, never a URL.
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
  failed: "Could not attach that image.",
} as const;

/** The screenshot, before and after it is attached. */
export const MapleAttachments = /** @__PURE__ */ forwardRef<HTMLElement, MapleAttachmentsProps>(
  function MapleAttachments(props, ref) {
    const scope = useComposerScope("Maple.Attachments");
    const { composer } = useMaple();
    const failed = useUpload(scope, props.upload);
    const captured = useCaptured(scope);
    const Element = (props.asChild ? Slot : "div") as "div";

    const className = ["mk-composer-row", "mk-shots", props.className].filter(Boolean).join(" ");
    if (composer.viewing !== undefined) {
      return kept({ className, attachments: composer.attachments, resolve: props.resolve }, ref);
    }

    const children = scope.pending ? filled(scope, failed, captured) : [hint()];
    return createElement(Element, { ref, className }, ...children);
  },
);

/**
 * What a comment already written kept. Nothing is offered here: a comment is
 * one body and whatever was attached when it was sent.
 */
/** One kept attachment: the image where it can be loaded, a line where not. */
function shot(one: MediaRef, resolve: MapleAttachmentsProps["resolve"]): ReactElement {
  const src = resolve?.(one);
  if (src === undefined) {
    return createElement("span", { key: one.key, className: "mk-shot-said" }, ATTACH_WORDS.kept);
  }
  return createElement("img", { key: one.key, className: "mk-shot", src, alt: ATTACH_WORDS.alt });
}

interface KeptProps {
  readonly className: string;
  readonly attachments: readonly MediaRef[];
  readonly resolve: MapleAttachmentsProps["resolve"];
}

function kept(props: KeptProps, ref: React.ForwardedRef<HTMLElement>): ReactElement {
  if (props.attachments.length === 0) return createElement("div", { ref, hidden: true });

  return createElement(
    "div",
    { ref, className: props.className },
    ...props.attachments.map((one) => shot(one, props.resolve)),
  );
}

/** The thumbnail, where it came from, and the control that takes it off. */
function filled(scope: ComposerScopeValue, failed: boolean, captured: boolean): ReactNode[] {
  return [
    createElement("img", {
      key: "shot",
      className: "mk-shot",
      src: scope.pending?.preview.url,
      alt: ATTACH_WORDS.alt,
    }),
    said(captured ? ATTACH_WORDS.taken : ATTACH_WORDS.hint, captured),
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
    failed
      ? createElement("span", { key: "bad", className: "mk-chip" }, ATTACH_WORDS.failed)
      : null,
  ];
}

/** Nothing attached: one quiet line, because both gestures are already live. */
function hint(): ReactNode {
  return said(ATTACH_WORDS.hint, false);
}

/** The sparkle marks the one Maple took by itself, and only that one. */
function said(words: string, byMaple: boolean): ReactNode {
  return createElement(
    "span",
    { key: "said", className: "mk-shot-said" },
    byMaple ? createElement(SparkleIcon, { key: "spark", size: 12 }) : null,
    words,
  );
}

/** Claims the capture the picker left, once. */
function useCaptured(scope: ComposerScopeValue): boolean {
  const shots = useShots();
  const [captured, setCaptured] = useState(false);
  const offered = scope.offer;

  useEffect(() => {
    if (!shots) return;
    const claim = (): void => {
      if (!shots.get()) return;
      const image = shots.take();
      if (image) {
        offered(image);
        setCaptured(true);
      }
    };

    claim();
    return shots.subscribe(claim);
  }, [offered, shots]);

  return captured && scope.pending !== undefined;
}

/** Uploads what was offered. Core has no route for it, so an application does. */
function useUpload(scope: ComposerScopeValue, upload: MapleAttachmentsProps["upload"]): boolean {
  const client = useMapleClient();
  const sent = useRef<PastedImage>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const image = scope.pending?.image;
    if (!image || !upload || sent.current === image) return;

    sent.current = image;
    let live = true;
    const attached = (ref: MediaRef): void => {
      if (live) client.attach(ref);
    };
    const broke = (): void => {
      if (live) setFailed(true);
    };

    void upload(image).then(attached, broke);
    return () => {
      live = false;
    };
  }, [scope.pending, upload, client]);

  return failed;
}
