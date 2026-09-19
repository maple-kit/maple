/**
 * `Maple.Picker`: the part that makes an armed pick into an open composer.
 *
 * Without it `arm()` sets a flag nobody reads. It runs the session for
 * whichever kind is armed, draws what is under the pointer with the same ring
 * a comment gets, and hands the composer a target built by `targetFor`. The
 * shield above the page is what gives element and region a cursor and keeps a
 * click off the island; a passage has no shield, because text under one
 * cannot be selected.
 */

import { captureContext, watchPickKeys } from "@maple-kit/core/overlay";
import { captureElement } from "@maple-kit/core/screenshot";
import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, Fragment, useCallback, useEffect, useRef, useState } from "react";

import { useMapleUi } from "../context.js";
import { PICK_ORDER } from "../island/language.js";
import { MapleTargetRing } from "../marks/ring.js";
import { useShots } from "../shots.js";
import { PICK_HINTS, PICKER_COPY, pickerLabel } from "./language.js";
import { startSession } from "./session.js";
import { elementOf, targetFor } from "./target.js";

import type { ShotStore } from "../shots.js";
import type { PickKind } from "@maple-kit/core/client";
import type { Pick, Rect } from "@maple-kit/core/overlay";
import type { ReactElement, ReactNode } from "react";

const PART = "Maple.Picker";

/** How the picker behaves. Everything it needs beyond this is the controller's. */
export interface MaplePickerProps {
  /** The bar naming the gesture. On unless an application draws its own. */
  readonly hint?: boolean;
  readonly className?: string;
}

/** Runs the armed pick, and closes it into the composer. */
export function MaplePicker(props: MaplePickerProps): ReactNode {
  const { pick } = useMaple();
  const client = useMapleClient();
  const { container, root } = useMapleUi(PART);
  const [hovered, setHovered] = useState<Pick>();
  const [band, setBand] = useState<Rect>();

  const kind = pick.kind;
  const commit = useCommit();

  useEffect(() => {
    if (!pick.armed || !kind) return;
    const stop = new AbortController();

    startSession(kind, stop.signal, {
      ignore: (event: Event) => onOwnControl(event, root),
      onHover: setHovered,
      onDraw: setBand,
      onPick: (found) => commit(found),
    });
    return () => {
      stop.abort();
      setHovered(undefined);
      setBand(undefined);
    };
  }, [commit, kind, pick.armed, root]);

  useKeys(pick.armed, kind, client);

  if (!pick.armed || !kind) return null;

  return createElement(
    Fragment,
    null,
    kind === "text" ? null : createElement("div", { className: shieldClass(props, kind) }),
    band ? createElement("div", { className: "mk-band", style: bandStyle(band) }) : null,
    createElement(MapleTargetRing, {
      state: "hovered",
      target: targetOf(hovered),
      ...named(hovered, container),
    }),
    props.hint === false ? null : createElement(Hint, { kind }),
  );
}

/**
 * One pick, turned into an open composer. The shot is taken here because the
 * panel insets the frame it opens over, and is not awaited.
 */
function useCommit(): (pick: Pick) => void {
  const client = useMapleClient();
  const shots = useShots();

  return useCallback(
    (pick: Pick) => {
      const target = targetFor(pick, { page: captureContext() });
      const element = elementOf(pick);
      if (shots && element) capture(element, shots);

      client.disarm();
      if (target) client.openComposer(target);
    },
    [client, shots],
  );
}

/**
 * Best effort, silent when it fails: snapdom is an optional peer, and paste
 * and drop were always the better path anyway.
 */
function capture(element: Element, shots: ShotStore): void {
  void captureElement(element, { page: true }).then(
    (blob) => shots.put({ blob, type: blob.type }),
    () => shots.put(undefined),
  );
}

/** Escape leaves picking; `t` cycles the three without going back to the island. */
function useKeys(
  armed: boolean,
  kind: PickKind | undefined,
  client: ReturnType<typeof useMapleClient>,
): void {
  const latest = useRef(kind);
  latest.current = kind;

  useEffect(() => {
    if (!armed) return;
    const stop = new AbortController();

    watchPickKeys({
      signal: stop.signal,
      onCancel: () => client.disarm(),
      onCycle: () => client.arm(next(latest.current)),
    });
    return () => stop.abort();
  }, [armed, client]);
}

/**
 * True when the event's real target is one of the overlay's own controls. The
 * shield is the exception: it exists to be clicked through. Everything else in
 * the shadow root is a control, and a control that also picked the page behind
 * it would be unusable.
 */
export function onOwnControl(event: Event, root: ShadowRoot): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof Element) || target.getRootNode() !== root) return false;
  return !target.classList.contains("mk-shield");
}

/** The next kind in the order the island shows them, wrapping at the end. */
function next(kind: PickKind | undefined): PickKind {
  const at = kind === undefined ? -1 : PICK_ORDER.indexOf(kind);
  return PICK_ORDER[(at + 1) % PICK_ORDER.length] ?? "element";
}

interface HintProps {
  readonly kind: PickKind;
}

/** What to do, the other two ways to do it, and the way out. */
function Hint(props: HintProps): ReactElement {
  const client = useMapleClient();

  return createElement(
    "div",
    { className: "mk-pick-bar", role: "status", "aria-label": pickerLabel(props.kind) },
    createElement("span", { className: "mk-pick-say" }, PICK_HINTS[props.kind]),
    createElement(
      "span",
      { className: "mk-pick-kinds" },
      ...PICK_ORDER.map((kind) =>
        createElement(
          "button",
          {
            key: kind,
            type: "button",
            className: "mk-pick-kind mk-hit",
            "aria-pressed": kind === props.kind,
            onClick: () => client.arm(kind),
          },
          kind,
        ),
      ),
    ),
    createElement(
      "button",
      { type: "button", className: "mk-pick-stop mk-hit", onClick: () => client.disarm() },
      PICKER_COPY.cancel,
      createElement("kbd", { className: "mk-kbd" }, PICKER_COPY.cancelHint),
    ),
  );
}

function shieldClass(props: MaplePickerProps, kind: PickKind): string {
  const names = ["mk-shield", kind === "region" && "mk-shield-drag", props.className];
  return names.filter(Boolean).join(" ");
}

/** The ring follows an element or a passage; a region has its own band. */
function targetOf(pick: Pick | undefined): Element | Range | null {
  if (!pick) return null;
  if (pick.kind === "element") return pick.element;
  return pick.kind === "text" ? pick.range : null;
}

/** The ring's words, left off entirely when nothing on the page names it. */
function named(pick: Pick | undefined, container: HTMLElement): { label?: string } {
  const label = pick ? targetFor(pick, { root: container.ownerDocument })?.label : undefined;
  return label === undefined ? {} : { label };
}

function bandStyle(rect: Rect): Record<string, string> {
  return {
    "--mk-x": px(rect.x),
    "--mk-y": px(rect.y),
    "--mk-w": px(rect.width),
    "--mk-h": px(rect.height),
  };
}

function px(value: number): string {
  return `${String(value)}px`;
}
