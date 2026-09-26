/**
 * Every mark on the page, and the ring that says which one is being answered.
 *
 * One loop measures and moves all of them per scrolled frame, and the
 * collision resolver steps a mark sideways until its hit area clears its
 * neighbours' — two marks a thumb cannot tell apart are two marks that get
 * clicked wrong. Marks are drawn from the filter's list; the addresses are not.
 */

import { kindOf, regionBox, resolveAnchor, sourceFor } from "@maple-kit/core/anchor";
import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useCallback, useEffect, useMemo, useRef } from "react";

import { useMapleUi } from "../context.js";
import { hoverHandlers } from "../hover.js";
import { useFrameLoop, viewportHeight } from "./frame.js";
import { culled, markSpot, placeMark } from "./geometry.js";
import { ringLabel } from "./label.js";
import { MapleMark } from "./mark.js";
import { useNudges } from "./nudge.js";
import { flag, OFF_ATTRIBUTE, place } from "./paint.js";
import { addresses, draftPlacements, placements } from "./placement.js";
import { MapleTargetRing } from "./ring.js";

import type { Box } from "./geometry.js";
import type { Nudge, Nudges } from "./nudge.js";
import type { DraftPlacement, Located, Placement } from "./placement.js";
import type { RingState, TargetRingProps } from "./ring.js";
import type { Comment } from "@maple-kit/core";
import type { Anchor, LabelSource } from "@maple-kit/core/anchor";
import type { ClientState, ComposerTarget, Detail, MapleClient } from "@maple-kit/core/client";
import type { Draft } from "@maple-kit/core/overlay";

const PART = "Maple.MarkLayer";

/** What the layer draws. Both lists default to the controller's own. */
export interface MarkLayerProps {
  /** Everything on the branch: what the addresses are counted from. */
  readonly comments?: readonly Comment[];
  /** The ones to draw. Defaults to what the current filter shows. */
  readonly visible?: readonly Comment[];
  readonly selectedId?: string;
  /** What a click does. Defaults to opening the comment, which is the point. */
  readonly onSelect?: (comment: Comment) => void;
  readonly className?: string;
}

/** The marks, and the one ring they share. */
export const MapleMarkLayer = /** @__PURE__ */ forwardRef<HTMLDivElement, MarkLayerProps>(
  function MapleMarkLayer(props, ref) {
    const { className } = props;
    const { container } = useMapleUi(PART);
    const state = useMaple();
    const client = useMapleClient();
    const chosen = props.onSelect;
    const onSelect = useCallback(
      (comment: Comment) => {
        if (chosen) return chosen(comment);
        client.viewComment(comment.id);
      },
      [chosen, client],
    );

    const comments = props.comments ?? state.comments;
    const visible = props.visible ?? state.visible;
    const selectedId = props.selectedId ?? state.selected ?? undefined;
    const peeked = state.peeked ?? undefined;
    const address = useMemo(() => addresses(comments), [comments]);
    const placed = useMemo(
      () => placements(visible, address, container.ownerDocument),
      [visible, address, container],
    );

    const drafts = useWaiting(state);
    const drafted = useMemo(
      () => draftPlacements(drafts, container.ownerDocument),
      [drafts, container],
    );

    const nudges = useNudges();
    const nodes = useRef(new Map<string, HTMLButtonElement>());
    const paint = useCallback(() => {
      const height = viewportHeight(container);
      const taken: Box[] = [];
      for (const [id, located] of everything(placed, drafted)) {
        const node = nodes.current.get(id);
        const moved = nudges.of(id);
        if (node) taken.push(step(node, located, { height, taken, ...(moved ? { moved } : {}) }));
      }
    }, [container, drafted, nudges, placed]);

    useFrameLoop(PART, paint);
    useScrollTo(placed, selectedId);

    // Memoised so a keystroke in the composer re-renders the ring and not
    // thirty marks, each of which measures an element to draw itself.
    const marks = useMemo(
      () =>
        placed.map((placement) =>
          createElement(MapleMark, {
            ...markProps(placement, { selectedId, peeked, nudges }),
            ...nudges.handlersFor(placement.comment.id),
            key: placement.comment.id,
            ref: keep(nodes.current, placement.comment.id),
            onClick: () => onSelect(placement.comment),
            ...pointing(client, placement.comment.id),
          }),
        ),
      [client, nudges, onSelect, peeked, placed, selectedId],
    );
    const unsent = useMemo(
      () =>
        drafted.map((placement) =>
          createElement(MapleMark, {
            ...draftProps(placement, { peeked, nudges }),
            ...nudges.handlersFor(placement.draft.id),
            key: placement.draft.id,
            ref: keep(nodes.current, placement.draft.id),
            onClick: () => client.resumeDraft(placement.draft.id),
            ...pointing(client, placement.draft.id),
          }),
        ),
      [client, drafted, nudges, peeked],
    );

    return createElement(
      "div",
      { className: className ? `mk-marks ${className}` : "mk-marks", ref },
      ...unsent,
      ...marks,
      createElement(
        MapleTargetRing,
        ringFor({
          client: state,
          placed,
          drafted,
          pointing: { peeked, selected: selectedId },
          root: container.ownerDocument,
        }),
      ),
    );
  },
);

/**
 * A link naming a comment has to land on it: the island opens, the ring is
 * drawn, and the page moves to what it is about rather than asking anyone to.
 */
function useScrollTo(placed: readonly Placement[], selectedId: string | undefined): void {
  const found = placed.find((placement) => placement.comment.id === selectedId);
  const target = found?.element;

  useEffect(() => {
    target?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, [target]);
}

/**
 * The drafts that get a leaf: all of them but the one being written, which the
 * composer's own ring is already standing on.
 */
function useWaiting(state: ClientState): readonly Draft[] {
  const { composer, drafts } = state;
  const writing = composer.open ? composer.draftId : undefined;
  return useMemo(
    () => (writing === undefined ? drafts : drafts.filter((draft) => draft.id !== writing)),
    [drafts, writing],
  );
}

/** Comments first, then drafts: the order the collision resolver yields in. */
function everything(
  placed: readonly Placement[],
  drafted: readonly DraftPlacement[],
): readonly (readonly [string, Located])[] {
  return [
    ...placed.map((one) => [one.comment.id, one] as const),
    ...drafted.map((one) => [one.draft.id, one] as const),
  ];
}

/** Pointing at a mark or tabbing onto it peeks; leaving it lets go. */
function pointing(client: MapleClient, id: string) {
  return {
    ...hoverHandlers(
      () => client.peek(id),
      () => client.peek(null),
    ),
    onFocus: () => client.peek(id),
    onBlur: () => client.peek(null),
  };
}

/** The box a comment is drawn against: its rectangle, or the element itself. */
function boxOf(placement: Located): Box {
  const box = placement.range?.getBoundingClientRect() ?? placement.element.getBoundingClientRect();
  return placement.region === undefined ? box : regionBox(box, placement.region);
}

/** One frame's worth of the page, and where this mark was moved to. */
interface Frame {
  readonly height: number;
  readonly taken: readonly Box[];
  readonly moved?: Nudge;
}

/**
 * What one frame does to one mark: cull it, or clear it of its neighbours. One
 * that was dragged holds where it was put; the resolver undoes no decision.
 */
function step(node: HTMLButtonElement, placement: Located, frame: Frame): Box {
  const rect = boxOf(placement);
  const away = culled(rect, frame.height);
  flag(node, OFF_ATTRIBUTE, away);

  const wanted = markSpot(rect);
  const spot = frame.moved
    ? { ...wanted, x: wanted.x + frame.moved.dx, y: wanted.y + frame.moved.dy }
    : placeMark(wanted, frame.taken);
  if (!away) place(node, spot);
  return spot;
}

/** Keeps the node a frame will move. One callback per id, so refs stay stable. */
function keep(nodes: Map<string, HTMLButtonElement>, id: string) {
  return (node: HTMLButtonElement | null) => {
    if (node) nodes.set(id, node);
    else nodes.delete(id);
  };
}

/** What a mark is drawn from beyond its comment: the two pointers and a drag. */
interface MarkView {
  readonly selectedId: string | undefined;
  readonly peeked: string | undefined;
  readonly nudges: Nudges;
}

/** Everything the mark reads off the comment it stands for. */
function markProps(placement: Placement, view: MarkView) {
  const { comment } = placement;
  return {
    address: placement.address,
    status: comment.status,
    confidence: placement.confidence,
    author: comment.author.name,
    on: ringLabel({ kind: kindOf(comment.anchor), element: placement.element }),
    selected: comment.id === view.selectedId,
    peeked: comment.id === view.peeked,
    nudged: view.nudges.of(comment.id) !== undefined,
    dragging: view.nudges.dragging === comment.id,
    ...(comment.author.colorSlot === undefined ? {} : { colorSlot: comment.author.colorSlot }),
  };
}

/** A draft's mark: the muted outline, no number, and what it is on. */
function draftProps(placement: DraftPlacement, view: Omit<MarkView, "selectedId">) {
  const { draft } = placement;
  return {
    sent: false,
    confidence: placement.confidence,
    on: ringLabel({ kind: kindOf(draft.anchor), element: placement.element }),
    peeked: draft.id === view.peeked,
    nudged: view.nudges.of(draft.id) !== undefined,
    dragging: view.nudges.dragging === draft.id,
  };
}

/** Which comment each of the two pointers is on, neither of them the composer's. */
interface Pointing {
  readonly peeked: string | undefined;
  readonly selected: string | undefined;
}

/** What the ring is decided from: what is pointed at, then the composer. */
interface RingInput {
  readonly client: ClientState;
  readonly placed: readonly Placement[];
  readonly drafted: readonly DraftPlacement[];
  readonly pointing: Pointing;
  readonly root: ParentNode;
}

/**
 * A pointer wins, because a peek gives the ring straight back; then the
 * composer; then the click, which is what holds it after the hand has gone.
 */
function ringFor(input: RingInput): TargetRingProps {
  const peeked = marked(input, input.pointing.peeked, "hovered");
  if (peeked) return peeked;

  const { composer } = input.client;
  if (composer.open && composer.target) return composing(composer.target, input);

  return marked(input, input.pointing.selected, "selected") ?? {};
}

/** The ring around one drawn mark, or nothing when the page has no such mark. */
function marked(input: RingInput, id: string | undefined, state: RingState) {
  const hit = drawn(input, id);
  if (!hit) return undefined;

  return {
    target: hit.range ?? hit.element,
    ...(hit.region === undefined ? {} : { region: hit.region }),
    label: ringLabel({ kind: kindOf(hit.anchor), element: hit.element }),
    ...noteFor({ anchor: hit.anchor, element: hit.element }, input.client.detail),
    state,
  };
}

/** The drawn mark with this id, comment or draft, and the anchor it stands for. */
function drawn(
  input: RingInput,
  id: string | undefined,
): (Located & { anchor: Anchor }) | undefined {
  if (id === undefined) return undefined;
  const comment = input.placed.find((placement) => placement.comment.id === id);
  if (comment) return { ...comment, anchor: comment.comment.anchor };
  const draft = input.drafted.find((placement) => placement.draft.id === id);
  return draft ? { ...draft, anchor: draft.draft.anchor } : undefined;
}

/** A composer on something the page no longer has gets no ring, and no guess. */
function composing(target: ComposerTarget, input: RingInput): TargetRingProps {
  const found = resolveAnchor(target.anchor, { root: input.root, passage: target.kind === "text" });
  const label = ringLabel({
    kind: target.kind,
    anchor: target.anchor,
    ...(target.label === undefined ? {} : { named: target.label }),
    ...(found.status === "resolved" ? { element: found.element } : {}),
  });

  if (found.status !== "resolved") return {};
  return {
    target: found.range ?? found.element,
    ...(target.anchor.region === undefined ? {} : { region: target.anchor.region }),
    label,
    ...noteFor({ anchor: target.anchor, element: found.element }, input.client.detail),
    // A panel opened on a comment is reading it, not answering it, and the
    // ring says which of the two the reader is looking at.
    state: input.client.composer.viewing === undefined ? "composing" : "selected",
  };
}

/**
 * Where the element is written, under the name it is known by. Developer
 * detail only: in default detail a path is noise over the page itself.
 */
function noteFor(source: LabelSource, detail: Detail): { note?: string } {
  const note = detail === "developer" ? sourceFor(source) : undefined;
  return note === undefined ? {} : { note };
}
