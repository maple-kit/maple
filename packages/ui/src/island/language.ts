/**
 * Every word the island says, in one module.
 *
 * `orphaned` stays the wire type and "Unpinned" is what a person reads: about a
 * quarter of anchors lose their place over time, so the word may not sound like
 * a failure. The four reasons are two words each with the sentence in a
 * tooltip, because a list of comments is scanned rather than read.
 */

import type { CommentFilter, Corner, PickKind, ThemePreference } from "@maple-kit/core/client";

/** The five filters, in the words the pills show. `unpinned` is `orphaned`. */
export const FILTER_LABELS: Readonly<Record<CommentFilter, string>> = {
  all: "Active",
  open: "Open",
  needs_reverify: "Re-verify",
  resolved: "Resolved",
  unpinned: "Unpinned",
  drafts: "Drafts",
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

/** What a screen reader hears on a tally dot: the count and what it counts. */
export function tallyLabel(filter: CommentFilter, count: number): string {
  const many = count === 1 ? "comment" : "comments";
  return `${String(count)} ${FILTER_LABELS[filter].toLowerCase()} ${many}`;
}

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
  untagged: {
    name: "This build is not tagged",
    hint:
      "Comments still work, but none of them can name a component or the file it is written " +
      "in. Wrap the Next config in withMaple from @maple-kit/core/next, or the Vite config " +
      "in the maple plugin with tagger on.",
  },
  hidden: {
    name: "Hide the island",
    hint: "It goes until you reload. A comment arriving, or a link to one, brings it straight back.",
  },
} as const;

/** The GitHub link row. Short sentences: this is the one a reviewer acts on. */
export const ACCOUNT_COPY = {
  name: "GitHub",
  unlinked: "Link your account and comments are posted on the pull request as you.",
  linking: "Enter this code on GitHub. This stays open while you do.",
  open: "Open github.com",
  link: "Link",
  retry: "Try again",
  unlink: "Unlink",
  linkedAs: (login: string | undefined) => (login === undefined ? "Linked" : `Linked • ${login}`),
  unlinkHint: "Forgets the token here. GitHub keeps the authorisation until you revoke it.",
} as const;

/** The popup Sign in opens: three beats, in the order the reviewer does them. */
export const SIGNIN_COPY = {
  title: "Sign in with GitHub",
  copyStep: "Copy this code",
  copy: "Copy",
  copied: "Copied",
  openStep: "Open GitHub and paste it",
  open: "Open github.com",
  waiting: "Waiting for you to finish on GitHub. This closes by itself.",
} as const;

/** The sign-off: one icon button, so the words are its label and nothing more. */
export const APPROVE_COPY = {
  label: "Looked, found nothing wrong",
  signIn: "Sign in first: an approval nobody can be named for is not one.",
} as const;

/**
 * The unsent list. A comment is a draft until it is published, and every word
 * here has to carry that without ever calling it a failure.
 */
export const UNSENT_COPY = {
  line: "Some comments are unpublished",
  publish: "Publish",
  publishing: "Publishing…",
  more: "More ways to take them with you",
  markdown: "Copy as Markdown",
  json: "Copy as JSON",
  copied: "Copied",
  discard: "Throw this one away",
  discardGlyph: "✕",
  blank: "(nothing written yet)",
  you: "You",
} as const;

/** Drafts arriving: from a file, or from another branch's key on this origin. */
export const TRANSFER_COPY = {
  open: "Import drafts",
  close: "Close import",
  boxLabel: "An exported drafts file",
  boxHint: "Paste an export here, or drop its file",
  fileLabel: "Choose an exported drafts file",
  add: "Add",
  addHere: "Add here",
  cancel: "Cancel",
  unreadable: "That is not a Maple drafts export.",
  unsupported: "That export is from a newer Maple than this page.",
  ask: (branch: string, count: number) =>
    `${String(count)} ${count === 1 ? "draft was" : "drafts were"} written on ${branch}. Add ${count === 1 ? "it" : "them"} here?`,
  result: (result: { added: number; skipped: number; expired: number; invalid: number }) =>
    [
      `Added ${String(result.added)}`,
      result.skipped > 0 ? `${String(result.skipped)} already here` : "",
      result.expired > 0 ? `${String(result.expired)} too old` : "",
      result.invalid > 0 ? `${String(result.invalid)} not drafts` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  found: (count: number) => `${String(count)} ${count === 1 ? "draft" : "drafts"} saved under`,
  move: "Move here",
  dismiss: "Dismiss",
} as const;

/** Copy with no better home than a name. */
export const ISLAND_COPY = {
  title: "Comments",
  wordmark: "Maple",
  settings: "Settings",
  close: "Close the inventory",
  closeGlyph: "✕",
  newComment: "New:",
  empty: "Nothing here under this filter.",
  loading: "Reading the comments on this branch…",
  resolve: "Resolve",
  reopen: "Reopen",
  unread: {
    title: "Couldn't load the comments",
    line: "This list is not the whole story until they load.",
    retry: "Try again",
  },
  noDrafts: "No unpublished comments.",
  showAll: "Show all",
  showLess: "Show less",
  hide: "Hide",
  attachment: "shot",
} as const;

/** The card's resize handles, for a screen reader and the keyboard. */
export const RESIZE_COPY = {
  width: "Resize the width",
  height: "Resize the height",
} as const;

/** The pill's own words. One number, and it is the open one. */
export function openLabel(count: number): string {
  return `${String(count)} open`;
}

/** What a screen reader hears on the collapsed pill. */
export function triggerLabel(count: number): string {
  return `Open Maple: ${openLabel(count)}`;
}

/**
 * What a comment is on, in the words a reviewer would use. A passage is in
 * something and a region is an area of it; an element is simply its own name.
 */
export function kindPhrase(kind: PickKind, human: string | undefined): string {
  if (human === undefined) return "somewhere on this page";
  if (kind === "text") return `a passage in ${human}`;
  return kind === "region" ? `an area of ${human}` : human;
}
