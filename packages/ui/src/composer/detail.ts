/**
 * `Maple.Detail`: everything about this comment that a row has no room for.
 *
 * The island's rows are scanned, so they carry two words and a tooltip. The
 * panel is read, so it carries the sentence: who wrote it and how much that is
 * worth, where it is in its life, and — in developer detail — which rung found
 * it again, how sure that is, the source line and the CSS path. Those four used
 * to sit in the row as grey footnotes, where they were noise over the one thing
 * a row is for.
 */

import { kindOf, resolveAnchor } from "@maple-kit/core/anchor";
import { useMaple } from "@maple-kit/react";
import { createElement, forwardRef, Fragment } from "react";

import { useMapleUi } from "../context.js";
import { confidenceFor } from "../data.js";
import {
  DETAIL_COPY,
  ORPHAN_LABELS,
  orphanTitle,
  PROVENANCE_SENTENCES,
  RUNG_LABELS,
  rungLabel,
  STATUS_LABELS,
  STATUS_SENTENCES,
} from "../language.js";
import { Slot } from "../slot.js";

import type { AsChildProps } from "../slot.js";
import type { Comment } from "@maple-kit/core";
import type { Anchor, Resolution } from "@maple-kit/core/anchor";
import type { ComposerTarget, Detail } from "@maple-kit/core/client";
import type { ReactNode } from "react";

const PART = "Maple.Detail";

/** The block. Takes `asChild` and nothing that changes its look. */
export interface MapleDetailProps extends AsChildProps {
  readonly className?: string;
}

/** One labelled line. `mono` is for a value that is a path, not a phrase. */
interface DetailRow {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly mono?: boolean;
  /** Drawn in the one warm colour: something Maple noticed, not a status. */
  readonly noticed?: boolean;
}

/** The panel's account of what it has open. Absent when it has nothing. */
export const MapleDetail = /** @__PURE__ */ forwardRef<HTMLElement, MapleDetailProps>(
  function MapleDetail(props, ref) {
    const { comments, composer, detail } = useMaple();
    const { container } = useMapleUi(PART);
    const Element = (props.asChild ? Slot : "dl") as "dl";

    const comment = comments.find((one) => one.id === composer.viewing);
    const rows = detailRows({
      comment,
      detail,
      root: container.ownerDocument,
      ...(composer.target === undefined ? {} : { target: composer.target }),
    });
    if (rows.length === 0) return null;

    const className = ["mk-composer-row", "mk-ctx", "mk-detail", props.className]
      .filter(Boolean)
      .join(" ");
    return createElement(
      Element,
      { ref, className, "data-mk-detail": detail },
      ...rows.map(lineOf),
    );
  },
);

/** What the block is built from. Everything but the detail may be missing. */
interface DetailInput {
  readonly comment: Comment | undefined;
  readonly target?: ComposerTarget;
  readonly detail: Detail;
  readonly root: ParentNode;
}

/**
 * Who and where-in-its-life first, because those are true of every comment;
 * the cascade's own account after, and only when it was asked for.
 */
export function detailRows(input: DetailInput): readonly DetailRow[] {
  const anchor = input.comment?.anchor ?? input.target?.anchor;
  if (!anchor) return [];

  const found = resolveAnchor(anchor, { root: input.root });
  return [...about(input.comment), ...lost(found), ...technical(anchor, found, input.detail)];
}

/**
 * Why the page has nowhere to put it, under the status that says so. Two words
 * in a row read as a second status; here it is the sentence and the rungs.
 */
function lost(found: Resolution): readonly DetailRow[] {
  if (found.status !== "orphaned") return [];

  return [
    {
      label: DETAIL_COPY.lost,
      value: ORPHAN_LABELS[found.reason],
      note: orphanTitle(found.reason, found.tried).replace(`${ORPHAN_LABELS[found.reason]}. `, ""),
      noticed: true,
    },
  ];
}

/** The two facts a reader of a written comment needs and a row only hints at. */
function about(comment: Comment | undefined): readonly DetailRow[] {
  if (!comment) return [];

  return [
    {
      label: DETAIL_COPY.author,
      value: comment.author.name,
      note: PROVENANCE_SENTENCES[comment.author.provenance],
    },
    {
      label: DETAIL_COPY.status,
      value: STATUS_LABELS[comment.status],
      note: STATUS_SENTENCES[comment.status],
    },
  ];
}

/** The cascade's own account: which rung, how sure, and the two paths. */
function technical(anchor: Anchor, found: Resolution, detail: Detail): readonly DetailRow[] {
  if (detail !== "developer") return [];

  return [
    ...(found.status === "resolved" ? [rung(found)] : []),
    ...(kindOf(anchor) === "region" && anchor.region ? [area(anchor.region)] : []),
    ...pathRow(DETAIL_COPY.source, anchor.source),
    ...pathRow(DETAIL_COPY.selector, anchor.selector),
  ];
}

/** The rung that found it again, the percentage, and what the number buys. */
function rung(found: Extract<Resolution, { status: "resolved" }>): DetailRow {
  return {
    label: DETAIL_COPY.rung,
    value: `${RUNG_LABELS[found.by]} · ${rungLabel(Math.round(found.confidence * 100))}`,
    note: `${confidenceFor(found.confidence)} — ${DETAIL_COPY.rungNote}`,
  };
}

/** How much of its container the rectangle covers, which is what it records. */
function area(region: NonNullable<Anchor["region"]>): DetailRow {
  const percent = (value: number) => `${String(Math.round(value * 100))}%`;
  return {
    label: DETAIL_COPY.area,
    value: `${percent(region.width)} × ${percent(region.height)}`,
    note: DETAIL_COPY.areaNote,
  };
}

function pathRow(label: string, value: string | undefined): readonly DetailRow[] {
  return value === undefined ? [] : [{ label, value, mono: true }];
}

/** A label and its value, as a fragment, so the two columns are the list's. */
function lineOf(row: DetailRow): ReactNode {
  return createElement(
    Fragment,
    null,
    createElement("dt", null, row.label),
    createElement(
      "dd",
      {
        ...(row.mono === true ? { className: "mk-mono" } : {}),
        ...(row.noticed === true ? { "data-mk-maple": "true" } : {}),
      },
      row.value,
      row.note === undefined ? null : createElement("em", null, ` · ${row.note}`),
    ),
  );
}
