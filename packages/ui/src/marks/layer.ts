/**
 * Every mark on the page, and the ring that says which one is being answered.
 *
 * One loop measures and moves all of them per scrolled frame, and the
 * collision resolver steps a mark sideways until its hit area clears its
 * neighbours' — two marks a thumb cannot tell apart are two marks that get
 * clicked wrong. Marks are drawn from the filter's list; the addresses are not.
 */

import { resolveAnchor } from "@maple-kit/core/anchor";
import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useCallback, useEffect, useMemo, useRef } from "react";

import { useMapleUi } from "../context.js";
import { useFrameLoop, viewportHeight } from "./frame.js";
import { culled, markSpot, placeMark } from "./geometry.js";
import { ringLabel } from "./label.js";
import { MapleMark } from "./mark.js";
import { flag, OFF_ATTRIBUTE, place } from "./paint.js";
import { addresses, kindOf, placements } from "./placement.js";
import { MapleTargetRing } from "./ring.js";

import type { Box } from "./geometry.js";
import type { Placement } from "./placement.js";
import type { TargetRingProps } from "./ring.js";
import type { Comment } from "@maple-kit/core";
import type { ClientState, ComposerTarget } from "@maple-kit/core/client";

const PART = "Maple.MarkLayer";

/** What the layer draws. Both lists default to the controller's own. */
export interface MarkLayerProps {
  /** Everything on the branch: what the addresses are counted from. */
  readonly comments?: readonly Comment[];
  /** The ones to draw. Defaults to what the current filter shows. */
  readonly visible?: readonly Comment[];
  readonly selectedId?: string;
  readonly onSelect?: (comment: Comment) => void;
  readonly className?: string;
}

/** The marks, and the one ring they share. */
export const MapleMarkLayer = /** @__PURE__ */ forwardRef<HTMLDivElement, MarkLayerProps>(
  function MapleMarkLayer(props, ref) {
    const { className, onSelect } = props;
    const { container } = useMapleUi(PART);
    const state = useMaple();
    const client = useMapleClient();

    const comments = props.comments ?? state.comments;
    const visible = props.visible ?? state.visible;
    const selectedId = props.selectedId ?? state.selected ?? undefined;
    const peeked = state.peeked ?? undefined;
    const address = useMemo(() => addresses(comments), [comments]);
    const placed = useMemo(
      () => placements(visible, address, container.ownerDocument),
      [visible, address, container],
    );

    const nodes = useRef(new Map<string, HTMLButtonElement>());
    const paint = useCallback(() => {
      const height = viewportHeight(container);
      const taken: Box[] = [];
      for (const placement of placed) {
        const node = nodes.current.get(placement.comment.id);
        if (node) taken.push(step(node, placement, { height, taken }));
      }
    }, [container, placed]);

    useFrameLoop(PART, paint);
    useScrollTo(placed, selectedId);

    // Memoised so a keystroke in the composer re-renders the ring and not
    // thirty marks, each of which measures an element to draw itself.
    const marks = useMemo(
      () =>
        placed.map((placement) =>
          createElement(MapleMark, {
            ...markProps(placement, selectedId),
            key: placement.comment.id,
            ref: keep(nodes.current, placement.comment.id),
            onClick: () => onSelect?.(placement.comment),
            onPointerEnter: () => client.peek(placement.comment.id),
            onPointerLeave: () => client.peek(null),
            onFocus: () => client.peek(placement.comment.id),
            onBlur: () => client.peek(null),
          }),
        ),
      [client, onSelect, placed, selectedId],
    );

    return createElement(
      "div",
      { className: className ? `mk-marks ${className}` : "mk-marks", ref },
      ...marks,
      createElement(
        MapleTargetRing,
        ringFor({
          client: state,
          placed,
          hovered: peeked ?? selectedId,
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

/** What one frame does to one mark: cull it, or clear it of its neighbours. */
function step(
  node: HTMLButtonElement,
  placement: Placement,
  frame: { readonly height: number; readonly taken: readonly Box[] },
): Box {
  const rect = placement.element.getBoundingClientRect();
  const away = culled(rect, frame.height);
  flag(node, OFF_ATTRIBUTE, away);

  const spot = placeMark(markSpot(rect), frame.taken);
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

/** Everything the mark reads off the comment it stands for. */
function markProps(placement: Placement, selectedId: string | undefined) {
  const { comment } = placement;
  return {
    address: placement.address,
    status: comment.status,
    confidence: placement.confidence,
    author: comment.author.name,
    on: ringLabel({ kind: kindOf(comment.anchor), element: placement.element }),
    selected: comment.id === selectedId,
    ...(comment.author.colorSlot === undefined ? {} : { colorSlot: comment.author.colorSlot }),
  };
}

/** What the ring is decided from: the composer first, then a hovered mark. */
interface RingInput {
  readonly client: ClientState;
  readonly placed: readonly Placement[];
  readonly hovered: string | undefined;
  readonly root: ParentNode;
}

/**
 * The ring follows the composer while one is open, and a hovered mark
 * otherwise. Two rings would be two answers to "which one is this about".
 */
function ringFor(input: RingInput): TargetRingProps {
  const { composer } = input.client;
  if (composer.open && composer.target) return composing(composer.target, input.root);

  const hit = input.placed.find((placement) => placement.comment.id === input.hovered);
  if (!hit) return {};
  return {
    target: hit.range ?? hit.element,
    label: ringLabel({ kind: kindOf(hit.comment.anchor), element: hit.element }),
    state: "hovered",
  };
}

/** A composer on something the page no longer has gets no ring, and no guess. */
function composing(target: ComposerTarget, root: ParentNode): TargetRingProps {
  const found = resolveAnchor(target.anchor, { root, passage: target.kind === "text" });
  const label = ringLabel({
    kind: target.kind,
    anchor: target.anchor,
    ...(target.label === undefined ? {} : { named: target.label }),
    ...(found.status === "resolved" ? { element: found.element } : {}),
  });

  if (found.status !== "resolved") return {};
  return { target: found.range ?? found.element, label, state: "composing" };
}
