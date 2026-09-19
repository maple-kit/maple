import { describe, expect, it } from "vitest";

import { byReason, countsFor, kindOf, numbersFor } from "../src/island/comments.js";
import { islandCss } from "../src/island/css.js";
import {
  FILTER_LABELS,
  ISLAND_COPY,
  kindPhrase,
  openLabel,
  ORPHAN_LABELS,
  ORPHAN_SENTENCES,
  orphanTitle,
  pickTitle,
  triggerLabel,
} from "../src/island/language.js";
import { STAGGER_ROWS } from "../src/island/stagger.js";
import { relativeTime } from "../src/island/time.js";
import { COMMENTS } from "./fixtures.js";

import type { OrphanReason } from "@maple-kit/core/anchor";

const REASONS: Readonly<Record<string, OrphanReason>> = {
  c6: "missing",
  c7: "changed",
  c8: "ambiguous",
  c9: "empty",
};

describe("the count on the pill", () => {
  it("is everything not resolved, unpinned included", () => {
    const open = COMMENTS.filter((comment) => comment.status !== "resolved");
    expect(open).toHaveLength(8);
    expect(openLabel(open.length)).toBe("8 open");
    expect(triggerLabel(open.length)).toBe("Open Maple: 8 open");
  });

  it("is not split into open and lost", () => {
    expect(openLabel(8)).not.toContain("·");
  });
});

describe("the filter counts", () => {
  it("subtracts the resolved ones from All while they are hidden", () => {
    expect(countsFor(COMMENTS, false)).toEqual({
      all: 8,
      open: 3,
      needs_reverify: 1,
      resolved: 1,
      unpinned: 4,
    });
  });

  it("counts everything under All once resolved ones are asked for", () => {
    expect(countsFor(COMMENTS, true).all).toBe(9);
  });
});

describe("a comment's number", () => {
  it("is its place on the branch, oldest first", () => {
    const numbers = numbersFor([...COMMENTS].reverse());
    expect(numbers.get("c1")).toBe(1);
    expect(numbers.get("c9")).toBe(9);
  });
});

describe("what a comment is on", () => {
  it.each([
    ["c1", "element"],
    ["c4", "text"],
    ["c7", "text"],
  ])("reads %s as a %s", (id, kind) => {
    const comment = COMMENTS.find((one) => one.id === id)!;
    expect(kindOf(comment.anchor)).toBe(kind);
  });

  it("says it the way a reviewer would", () => {
    expect(kindPhrase("element", "the Yield card")).toBe("the Yield card");
    expect(kindPhrase("text", "the retention paragraph")).toBe(
      "a passage in the retention paragraph",
    );
    expect(kindPhrase("region", "the settings panel")).toBe("an area of the settings panel");
    expect(kindPhrase("element", undefined)).toBe("somewhere on this page");
  });
});

describe("the unpinned tab", () => {
  const orphans = COMMENTS.filter((comment) => comment.status === "orphaned");

  it("is the expected case, not an empty state: four of the nine", () => {
    expect(orphans).toHaveLength(4);
  });

  it("lists by reason", () => {
    const ordered = byReason(orphans, (comment) => REASONS[comment.id]);
    expect(ordered.map((comment) => comment.id)).toEqual(["c6", "c7", "c8", "c9"]);
  });

  it.each([
    ["empty", "No anchor"],
    ["missing", "Nothing matches"],
    ["ambiguous", "Several matches"],
    ["changed", "Text changed"],
  ])("labels %s with two words", (reason, label) => {
    expect(ORPHAN_LABELS[reason as OrphanReason]).toBe(label);
    expect(label.split(" ")).toHaveLength(2);
  });

  it("keeps the sentence in the tooltip", () => {
    expect(orphanTitle("missing")).toBe(`Nothing matches. ${ORPHAN_SENTENCES.missing}`);
  });

  it("never offers to re-place one by hand, which core cannot do", () => {
    const copy = Object.values(ISLAND_COPY).join(" ");
    expect(copy).not.toMatch(/re-?place|by hand/i);
  });
});

describe("the words", () => {
  it("says unpinned where the wire says orphaned", () => {
    expect(FILTER_LABELS.unpinned).toBe("Unpinned");
    expect(Object.values(FILTER_LABELS)).not.toContain("Orphaned");
  });

  it("tells a picker that t cycles the three", () => {
    expect(pickTitle("text")).toBe("Comment on text — press t while picking to cycle");
  });
});

describe("how long ago", () => {
  const now = Date.parse("2026-09-10T09:00:00.000Z");

  it.each([
    ["2026-09-10T08:59:30.000Z", "now"],
    ["2026-09-10T06:00:00.000Z", "3"],
    ["2026-09-08T09:00:00.000Z", "2"],
  ])("reads %s in the shortest true unit", (iso, expected) => {
    expect(relativeTime(iso, now)).toContain(expected);
  });
});

describe("the stagger", () => {
  const css = islandCss();

  it("steps the first six rows and lands the rest together", () => {
    for (let position = 1; position <= STAGGER_ROWS; position += 1) {
      expect(css).toContain(`.mk-row:nth-child(${String(position)})`);
      expect(css).toContain(`calc(var(--mk-stagger-step) * ${String(position - 1)})`);
    }
    expect(css).toContain(`.mk-row:nth-child(n + ${String(STAGGER_ROWS + 1)})`);
    expect(css).toContain("animation-delay: var(--mk-stagger-cap);");
  });

  it("gives no row a delay of its own beyond the cap", () => {
    expect(css).not.toMatch(/animation-delay:\s*\d/);
  });
});

describe("the island's rules", () => {
  const css = islandCss();

  it("never bounces or delays a close", () => {
    const start = css.indexOf('.mk-card[data-mk-phase="closing"]');
    const closing = css.slice(start, css.indexOf("}", start));
    expect(closing).toContain("var(--mk-dur-island-close)");
    expect(closing).toContain("var(--mk-ease-surface)");
    expect(closing).not.toContain("--mk-ease-entrance");
    expect(css).not.toMatch(/animation-delay:\s*var\(--mk-dur/);
  });

  /**
   * The one delay on this surface is the tooltip's intent, and it is on the
   * way in only: a hover-out that waits reads as a surface that missed it.
   */
  it("delays nothing but a tooltip appearing", () => {
    const delayed = css.split("}").filter((rule) => rule.includes("transition-delay"));

    expect(delayed).toHaveLength(1);
    expect(delayed[0]).toContain("transition-delay: var(--mk-delay-tooltip)");
    expect(delayed[0]).toContain(":popover-open");
  });

  it("presses at the one press scale and never below it", () => {
    expect(css).toContain("transform: scale(var(--mk-press));");
  });

  it("reaches the 40px hit floor through the token, never a literal", () => {
    expect(css).toContain("width: var(--mk-hit);");
  });
});
