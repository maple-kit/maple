/**
 * `Maple.Composer`: the side panel, and the same panel as a sheet under 640px.
 *
 * One component and a media query rather than a `variant="sheet"`. The panel
 * owns what the whole surface shares: the open and close motion, the pasted
 * image before it uploads, hold-to-peek, the frame it insets, and the prompt
 * that names an unsent comment before a link takes it away.
 */

import { imageFrom } from "@maple-kit/core/screenshot";
import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, Fragment, useEffect, useMemo, useState } from "react";

import { useMapleUi } from "../context.js";
import { dataAttributes } from "../data.js";
import { Slot } from "../slot.js";
import { useRestoreFocus } from "./focus.js";
import { createPreviews, createUploadSeam } from "./held.js";
import { useInset } from "./inset.js";
import { useHoldToPeek } from "./peek.js";
import { LeavePrompt } from "./prompt.js";
import { ComposerScope } from "./scope.js";

import type { AsChildProps } from "../slot.js";
import type { Previews, Upload } from "./held.js";
import type { LeaveAsk } from "./leave.js";
import type { ComposerScopeValue, PendingImage, SheetDetent } from "./scope.js";
import type { MediaSource } from "@maple-kit/core";
import type { HeldImage, MapleClient } from "@maple-kit/core/client";
import type { PastedImage } from "@maple-kit/core/screenshot";
import type {
  ClipboardEvent,
  DragEvent,
  ForwardedRef,
  KeyboardEvent,
  ReactElement,
  ReactNode,
  TransitionEvent,
} from "react";

/** How the composer is mounted. No prop here changes its look. */
export interface MapleComposerProps extends AsChildProps {
  readonly className?: string;
  readonly children?: ReactNode;
  /** The frame to inset while the panel is open, rather than cover. */
  readonly inset?: ElementCSSInlineStyle | null;
  /** Hold Space to see through the panel. On unless an application says otherwise. */
  readonly peek?: boolean;
  /** The same `LeaveAsk` the controller was given, so the confirm is drawn here. */
  readonly leave?: LeaveAsk;
}

/** What a screen reader calls the panel. */
export const COMPOSER_LABEL = "New comment";

/** Expand and collapse, in the words the two detents actually do. */
export const DETENT_LABELS: Readonly<Record<SheetDetent, string>> = {
  full: "Show less of the comment",
  half: "Show more of the comment",
};

/** So `will-change` exists only while the panel is moving. */
interface Motion {
  readonly open: boolean;
  readonly moving: boolean;
}

/** The panel. Every part below it reads the controller, never a prop. */
export const MapleComposer = /** @__PURE__ */ forwardRef<HTMLElement, MapleComposerProps>(
  function MapleComposer(props, ref) {
    const { composer, user } = useMaple();
    const client = useMapleClient();
    const { container } = useMapleUi("Maple.Composer");
    const view = container.ownerDocument.defaultView;

    const [panel, setPanel] = useState<HTMLElement | null>(null);
    const [motion, setMotion] = useState<Motion>({ open: composer.open, moving: false });
    const scope = useScopeValue(composer.open, view, props.peek !== false);

    if (motion.open !== composer.open) setMotion({ open: composer.open, moving: true });
    useInset(props.inset, composer.open ? panel : null, view);
    useRestoreFocus(composer.open, container);

    const Element = (props.asChild ? Slot : "section") as "section";
    const grabber = createElement(Grabber, { detent: scope.detent, toggle: scope.toggleDetent });

    return createElement(
      Fragment,
      null,
      createElement(
        ComposerScope.Provider,
        { value: scope },
        createElement(
          Element,
          {
            ...shellAttributes(composer.open, scope, motion),
            ...dataAttributes({ provenance: user ? "server" : "guest" }),
            className: props.className ? `mk-composer ${props.className}` : "mk-composer",
            role: "dialog",
            "aria-label": COMPOSER_LABEL,
            ref: composeInto(ref, setPanel),
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => onEscape(event, client),
            onPaste: (event: ClipboardEvent<HTMLElement>) => onPaste(event, scope),
            onDragOver: (event: DragEvent<HTMLElement>) => event.preventDefault(),
            onDrop: (event: DragEvent<HTMLElement>) => onDrop(event, scope),
            onTransitionEnd: (event: TransitionEvent<HTMLElement>) => {
              if (event.target === event.currentTarget)
                setMotion({ open: composer.open, moving: false });
            },
          },
          props.asChild ? props.children : createElement(Fragment, null, grabber, props.children),
        ),
      ),
      props.leave ? createElement(LeavePrompt, { ask: props.leave }) : null,
    );
  },
);

/** Open, peeking, the detent and whether it moves: the panel's whole state. */
function shellAttributes(open: boolean, scope: ComposerScopeValue, motion: Motion) {
  return {
    "data-mk-open": String(open),
    "data-mk-peek": String(scope.peeking),
    "data-mk-detent": scope.detent,
    "data-mk-moving": String(motion.moving),
    inert: !open,
  };
}

interface GrabberProps {
  readonly detent: SheetDetent;
  readonly toggle: () => void;
}

/** Two detents, as a control: a drag competes with the page's scroll. */
function Grabber(props: GrabberProps): ReactElement {
  return createElement("button", {
    type: "button",
    className: "mk-grab mk-hit mk-press",
    "aria-label": DETENT_LABELS[props.detent],
    "aria-expanded": props.detent === "full",
    onClick: props.toggle,
  });
}

/** Esc closes the composer and leaves the draft exactly where it is. */
function onEscape(event: KeyboardEvent<HTMLElement>, client: MapleClient): void {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  client.closeComposer();
}

function onPaste(event: ClipboardEvent<HTMLElement>, scope: ComposerScopeValue): void {
  const image = imageFrom(event.clipboardData);
  if (!image) return;
  event.preventDefault();
  scope.offer(image);
}

function onDrop(event: DragEvent<HTMLElement>, scope: ComposerScopeValue): void {
  const image = imageFrom(event.dataTransfer);
  if (!image) return;
  event.preventDefault();
  scope.offer(image);
}

/** The caller's ref and the panel's own: the inset has to measure. */
function composeInto(
  ref: ForwardedRef<HTMLElement>,
  set: (node: HTMLElement | null) => void,
): (node: HTMLElement | null) => void {
  return (node) => {
    set(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
}

/**
 * The shared scope. The image is held by the controller, per draft, and
 * previewed here from memory; a preview that is replaced or gone is revoked.
 */
function useScopeValue(open: boolean, view: Window | null, peekable: boolean): ComposerScopeValue {
  const client = useMapleClient();
  const { composer, media, phase } = useMaple();
  const { held } = composer;
  // Where the deployment keeps no screenshots there is nothing to publish one to.
  const keeps = media || (phase !== "ready" && phase !== "error");
  const [detent, setDetent] = useState<SheetDetent>("half");
  const [previews] = useState(createPreviews);
  const [upload] = useState(createUploadSeam);
  const peeking = useHoldToPeek(view, open && peekable);

  useEffect(() => () => previews.clear(), [previews]);

  return useMemo(
    () => ({
      peeking,
      detent,
      toggleDetent: () => setDetent((was) => (was === "half" ? "full" : "half")),
      pending: pendingFrom(held, previews),
      upload,
      offer: (image, source) => {
        if (!keeps) return;
        const next = heldFrom(image, source, upload.get());
        previews.forget(client.getState().composer.held);
        previews.make(next);
        client.holdImage(next);
      },
      clear: () => {
        previews.forget(client.getState().composer.held);
        client.releaseImage();
      },
    }),
    [peeking, detent, held, previews, upload, client, keeps],
  );
}

/** What the controller keeps: the blob, who chose it, and where the host wants it. */
function heldFrom(image: PastedImage, source: MediaSource | undefined, put: Upload | undefined) {
  return {
    blob: image.blob,
    contentType: image.type,
    source: source ?? "offered",
    ...(put ? { upload: (blob: Blob, type: string) => put({ blob, type }) } : {}),
  } satisfies HeldImage;
}

/** The held image with the preview that was made for it, if this panel made one. */
function pendingFrom(held: HeldImage | undefined, previews: Previews): PendingImage | undefined {
  const preview = previews.of(held);
  if (!held || !preview) return undefined;
  return { image: { blob: held.blob, type: held.contentType }, preview, source: held.source };
}
