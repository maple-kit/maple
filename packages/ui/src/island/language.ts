/**
 * Every word the island says, in one module.
 *
 * `orphaned` stays the wire type and "Unpinned" is what a person reads: about a
 * quarter of anchors lose their place over time, so the word may not sound like
 * a failure. The four reasons are two words each with the sentence in a
 * tooltip, because a list of comments is scanned rather than read.
 */

import type { PartConfidence } from "../data.js";
import type { OrphanReason, Rung } from "@maple-kit/core/anchor";
import type { CommentFilter, Corner, PickKind, ThemePreference } from "@maple-kit/core/client";

/** The five filters, in the words the pills show. `unpinned` is `orphaned`. */
export const FILTER_LABELS: Readonly<Record<CommentFilter, string>> = {
  all: "All",
  open: "Open",
  needs_reverify: "Re-verify",
  resolved: "Resolved",
  unpinned: "Unpinned",
};

/** The order the filters are shown in. Unpinned is last: it is the odd one. */
export const FILTER_ORDER: readonly CommentFilter[] = ["all", "open", "needs_reverify", "resolved"];

/**
 * The four the tally has a dot for, which is every filter but `all`. Their
 * colours are the marks' colours, so the row doubles as the key to the page.
 */
export const TALLY_ORDER: readonly CommentFilter[] = [
  "open",
  "needs_reverify",
  "resolved",
  "unpinned",
];

/** What a screen reader calls the select, which shows a filter name not a noun. */
export const FILTERS_LABEL = "Show";

/** A dot's tooltip: what it counts, and the fact that clicking narrows to it. */
export function tallyTitle(filter: CommentFilter, count: number): string {
  const many = count === 1 ? "comment" : "comments";
  return `${String(count)} ${FILTER_LABELS[filter].toLowerCase()} ${many} — click to show only these`;
}

/** Two words each. The sentence underneath belongs in the tooltip, not the row. */
export const ORPHAN_LABELS: Readonly<Record<OrphanReason, string>> = {
  empty: "No anchor",
  missing: "Nothing matches",
  ambiguous: "Several matches",
  changed: "Text changed",
};

/** What the chip's tooltip says after its two words. */
export const ORPHAN_SENTENCES: Readonly<Record<OrphanReason, string>> = {
  empty: "Written before the build tagged anything, so there was never anything to search for.",
  missing: "Every rung was tried. The element is gone, or this is a different route.",
  ambiguous: "More than one element answers to what was recorded, and nothing tells them apart.",
  changed:
    "The passage is still on the page, but edited past the point where the match can be trusted.",
};

/**
 * How a rung reads inside a sentence. It is never shown as a field name: the
 * chip carries the number and this is what the tooltip says about it.
 */
export const RUNG_LABELS: Readonly<Record<Rung, string>> = {
  key: "the app's own key",
  source: "the source line",
  component: "the component name",
  quote: "the quoted text",
  selector: "a CSS path",
};

/** The order the unpinned tab groups its rows in. */
export const ORPHAN_ORDER: readonly OrphanReason[] = ["missing", "changed", "ambiguous", "empty"];

/** The three picks, in the order the island's bottom edge shows them. */
export const PICK_ORDER: readonly PickKind[] = ["element", "text", "region"];

/** The word on each pick button. */
export const PICK_LABELS: Readonly<Record<PickKind, string>> = {
  element: "Element",
  region: "Region",
  text: "Text",
};

/** The three themes, in the words the switch shows. */
export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

/** What each theme does, for the tooltip. `auto` is the one worth explaining. */
export const THEME_TITLES: Readonly<Record<ThemePreference, string>> = {
  auto: "The opposite of this page, so the overlay reads as a guest on it.",
  light: "Always light, whatever this page is in.",
  dark: "Always dark, whatever this page is in.",
};

/** The four corners, in the words the picker shows under the switch. */
export const CORNER_LABELS: Readonly<Record<Corner, string>> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

/** The order the corner picker draws them in: reading order, two by two. */
export const CORNER_ORDER: readonly Corner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** One sentence per setting: what it does, not what it is called again. */
export const SETTINGS_COPY = {
  theme: {
    name: "Theme",
    hint: "What the overlay itself is drawn in. A comment always records the page's own.",
  },
  position: {
    name: "Corner",
    hint: "Where the island sits. Dragging it by its pill does the same thing.",
  },
  hideResolved: {
    name: "Hide resolved",
    hint: "Done comments stay off the page and out of the list until you pick the Resolved filter.",
  },
  developer: {
    name: "Developer mode",
    hint: "Shows how each comment is re-found after a deploy, its source line and its CSS path.",
  },
  hidden: {
    name: "Hide the island",
    hint: "It goes until you reload. A comment arriving, or a link to one, brings it straight back.",
  },
} as const;

/** Copy with no better home than a name. */
export const ISLAND_COPY = {
  title: "Comments",
  settings: "Settings",
  close: "Close the inventory",
  closeGlyph: "✕",
  newComment: "New comment",
  empty: "Nothing here under this filter.",
  showAll: "Show all",
  showLess: "Show less",
  hide: "Hide",
  attachment: "shot",
} as const;

/** The pill's own words. One number, and it is the open one. */
export function openLabel(count: number): string {
  return `${String(count)} open`;
}

/** What a screen reader hears on the collapsed pill. */
export function triggerLabel(count: number): string {
  return `Open Maple: ${openLabel(count)}`;
}

/** A pick button's tooltip. `t` cycles the three while one is armed. */
export function pickTitle(kind: PickKind): string {
  return `Comment on ${kind} — press t while picking to cycle`;
}

/** The chip's full tooltip: the two words, then the sentence. */
export function orphanTitle(reason: OrphanReason, tried: readonly Rung[] = []): string {
  const ladder = tried.length === 0 ? "" : ` Tried: ${tried.map(rungWord).join(" → ")}.`;
  return `${ORPHAN_LABELS[reason]}. ${ORPHAN_SENTENCES[reason]}${ladder}`;
}

/** One rung, as it appears in a list of the ones that were tried. */
function rungWord(rung: Rung): string {
  return RUNG_LABELS[rung];
}

/**
 * The rung chip's sentence. The number is on the chip; this says what the
 * number is worth, which is the part a field name never manages to.
 */
export function rungTitle(rung: Rung, confidence: PartConfidence): string {
  return (
    `Found again by ${RUNG_LABELS[rung]} — ${confidence}. ` +
    "After a redeploy Maple re-finds this element that way, and a lower rung " +
    "is worth less even when it matched exactly."
  );
}

/** What a percentage on a chip is called, for anyone not looking at it. */
export function rungLabel(percent: number): string {
  return `${String(percent)}%`;
}

/** The two developer chips that carry a path rather than a number. */
export const PATH_COPY = {
  source: {
    word: "source",
    sentence:
      "Where this element is written, recorded by the build's tagger. It is the " +
      "second rung, and the one an agent opens the file from.",
  },
  selector: {
    word: "CSS path",
    sentence:
      "The last rung tried, and the least durable: a rebuild that changes a class " +
      "name changes this, which is why it is never the only thing recorded.",
  },
} as const;

/**
 * What a comment is on, in the words a reviewer would use. A passage is in
 * something and a region is an area of it; an element is simply its own name.
 */
export function kindPhrase(kind: PickKind, human: string | undefined): string {
  if (human === undefined) return "somewhere on this page";
  if (kind === "text") return `a passage in ${human}`;
  return kind === "region" ? `an area of ${human}` : human;
}
