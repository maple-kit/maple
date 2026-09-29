import { describe, expect, it } from "vitest";

import { contextRows } from "../src/overlay/index.js";

import type { ContextRow } from "../src/overlay/index.js";
import type { CommentContext } from "../src/types.js";

/** A stored comment's context, which is the shape the composer reads back. */
function stored(over: Partial<CommentContext> = {}, drop: readonly string[] = []): CommentContext {
  const base: CommentContext = {
    url: "https://preview.example/dashboard",
    viewportWidth: 1440,
    viewportHeight: 900,
    contentWidth: 1020,
    devicePixelRatio: 2,
    colorScheme: "light",
    locale: "en-GB",
    ...over,
  };
  return Object.fromEntries(
    Object.entries(base).filter(([key]) => !drop.includes(key)),
  ) as CommentContext;
}

/** The rows as a lookup, so a test names a label rather than an index. */
function byLabel(rows: readonly ContextRow[]) {
  return new Map(rows.map((row) => [row.label, row]));
}

/**
 * The window-versus-content gap is the insight the badge exists for, so the
 * width row states it rather than leaving a reader to subtract.
 */
describe("the width rows", () => {
  it("says how much of the width was covered, not two numbers to subtract", () => {
    const rows = byLabel(contextRows(stored()));

    expect(rows.get("Width")?.value).toBe("1440px");
    expect(rows.get("Width")?.note).toBe("420px covered");
    expect(rows.get("Content")?.value).toBe("1020px");
  });

  it("leaves the note off when nothing covered the layout", () => {
    const rows = byLabel(contextRows(stored({ contentWidth: 1440 })));

    expect(rows.get("Width")?.note).toBeUndefined();
  });
});

describe("the environment rows", () => {
  it("lists every fact about the page, under plain labels", () => {
    const labels = contextRows(stored({ breakpoint: "lg" })).map((row) => row.label);

    expect(labels).toEqual(["Width", "Content", "Breakpoint", "Theme", "Pixel ratio", "Locale"]);
    expect(byLabel(contextRows(stored())).get("Pixel ratio")?.value).toBe("2×");
  });

  it("marks the locale as a machine string so it is not read as prose", () => {
    const rows = byLabel(contextRows(stored()));

    expect(rows.get("Locale")?.mono).toBe(true);
    expect(rows.get("Locale")?.value).toBe("en-GB");
  });

  it("leaves out what the capture never recorded", () => {
    const labels = contextRows(stored({}, ["locale"])).map((row) => row.label);

    expect(labels).not.toContain("Locale");
    expect(labels).not.toContain("Breakpoint");
  });

  it("names the regions that were open, as a list rather than a count", () => {
    const rows = byLabel(
      contextRows(stored({ regions: [{ role: "complementary", label: "Copilot", width: 420 }] })),
    );

    expect(rows.get("Open")?.value).toBe("Copilot");
  });
});
