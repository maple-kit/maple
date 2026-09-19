/**
 * The comments the demo starts with, anchored to elements the page has.
 *
 * An empty store is the least interesting state the overlay has, and the one
 * a first run always lands in: nothing to see means no marks, no counts and
 * no rows. These three cover three statuses and all three picks, so opening
 * the example shows what the island is for before anything is clicked.
 */

import type { NewComment } from "@maple-kit/core";

/** The page they were left on. The dev server is the only one there is. */
const CONTEXT = {
  url: "http://localhost:5173/",
  viewportWidth: 1440,
  viewportHeight: 900,
  contentWidth: 1232,
  devicePixelRatio: 2,
  colorScheme: "light",
  locale: "en-GB",
  breakpoint: "lg",
  regions: [{ role: "navigation", label: "Sections", width: 208 }],
} as const;

function at(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
}

/** Three, so the pill reads a number and every status has a row. */
export function seedComments(branch: string): readonly NewComment[] {
  return [
    {
      branch,
      body: "This delta is red for a drop in time-to-merge, which is the good direction. Flip the colour rule for this card.",
      createdAt: at(26),
      author: { id: "ada", name: "Ada", provenance: "server", colorSlot: 6 },
      anchor: {
        component: "MetricCard",
        selector: ".metrics > .metric:nth-of-type(3)",
        quote: { exact: "4h 12m" },
      },
      context: CONTEXT,
    },
    {
      branch,
      body: "Can this read “held until an agent resolves it” rather than naming the internal state? in_progress means nothing outside the code.",
      createdAt: at(4),
      author: { id: "grace", name: "Grace", provenance: "server", colorSlot: 0 },
      anchor: {
        component: "GateNotice",
        selector: ".notice p",
        quote: { exact: "until an agent resolves it" },
      },
      context: CONTEXT,
    },
    {
      branch,
      body: "The blocked pips are the same red as the down arrows above. One of the two should change.",
      createdAt: at(1),
      author: { id: "alan", name: "Alan", provenance: "guest" },
      anchor: { component: "ReviewTable", selector: ".table-card table" },
      context: CONTEXT,
    },
  ];
}
