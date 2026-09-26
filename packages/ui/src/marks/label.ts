/**
 * What the ring and the mark say out loud.
 *
 * The human name is `labelFor` in `@maple-kit/core/anchor` and nothing else —
 * an attribute the application wrote, or its component's name unpicked. All
 * this adds is the phrase around it, so a reviewer reads "a passage in the
 * retention paragraph" rather than a selector, and never reads a field name.
 */

import { labelFor } from "@maple-kit/core/anchor";

import { STATUS_LABELS } from "../language.js";

import type { CommentStatus } from "@maple-kit/core";
import type { Anchor } from "@maple-kit/core/anchor";
import type { PickKind } from "@maple-kit/core/client";

/** What a comment is on, when nothing on the page names it. */
export const NOTHING_NAMED = "this page";

/** Everything the ring's label is built from. Each field may be missing. */
export interface RingLabel {
  readonly kind?: PickKind;
  readonly element?: Element | null;
  readonly anchor?: Anchor;
  /** What the composer already named it, which wins over re-reading the page. */
  readonly named?: string;
}

/** The phrase for one kind of target: an element is simply its own name. */
export function kindPhrase(kind: PickKind | undefined, human: string | undefined): string {
  if (!human) return NOTHING_NAMED;
  if (kind === "text") return `a passage in ${human}`;
  return kind === "region" ? `an area of ${human}` : human;
}

/** The ring's words: the application's name for the thing, in a phrase. */
export function ringLabel(label: RingLabel): string {
  const human =
    label.named ??
    labelFor({
      ...(label.element === undefined ? {} : { element: label.element }),
      ...(label.anchor === undefined ? {} : { anchor: label.anchor }),
    });
  return kindPhrase(label.kind, human);
}

/** Joins what is known, so a missing author never leaves a stray separator. */
function joined(parts: readonly (string | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/** What an unsent comment is called wherever a status would otherwise go. */
export const DRAFT_LABEL = "Draft";

/** The mark's tooltip: who, where in its life, and what it is on. */
export function markTitle(
  author: string | undefined,
  status: CommentStatus | "draft",
  on?: string,
): string {
  return joined([author, status === "draft" ? DRAFT_LABEL : STATUS_LABELS[status], on]);
}

/**
 * The mark's accessible name. The address comes first, because it is the
 * address; a draft has none yet, and says it is one instead.
 */
export function markLabel(
  address: number | undefined,
  author: string | undefined,
  status: CommentStatus,
): string {
  const who = author ? ` by ${author}` : "";
  if (address === undefined) return `${DRAFT_LABEL} comment${who}`;
  return `Comment ${address}${who}, ${STATUS_LABELS[status]}`;
}
