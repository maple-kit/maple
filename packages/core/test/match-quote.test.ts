import { describe, expect, it } from "vitest";

import { matchQuote } from "../src/lib/match-quote.js";

const PAGE =
  "Revenue rose in the first quarter. Costs rose in the first quarter. " +
  "The board met on Tuesday and approved the plan without discussion.";

function quoted(text: string, match: { start: number; end: number } | undefined): string {
  return match ? text.slice(match.start, match.end) : "";
}

describe("matching a quote", () => {
  it("finds an unchanged quote", () => {
    const match = matchQuote(PAGE, "approved the plan");
    expect(quoted(PAGE, match)).toBe("approved the plan");
    expect(match?.score).toBe(1);
  });

  it("finds a quote a word of which has changed", () => {
    const match = matchQuote(PAGE, "approved the proposal");
    expect(quoted(PAGE, match)).toContain("approved the p");
    expect(match?.score).toBeLessThan(1);
    expect(match?.score).toBeGreaterThan(0.5);
  });

  it("returns nothing for an empty quote", () => {
    expect(matchQuote(PAGE, "")).toBeUndefined();
  });

  it("returns nothing when the quote is not there at all", () => {
    expect(matchQuote(PAGE, "entirely unrelated wording here")).toBeUndefined();
  });

  it("uses the prefix to choose between two identical quotes", () => {
    const match = matchQuote(PAGE, "rose in the first quarter", { prefix: "Costs " });
    expect(PAGE.slice(match!.start - 6, match!.start)).toBe("Costs ");
  });

  it("uses the suffix to choose between two identical quotes", () => {
    const match = matchQuote(PAGE, "rose in the first quarter", { suffix: ". The board" });
    expect(PAGE.slice(match!.end, match!.end + 11)).toBe(". The board");
  });

  it("uses the recorded offset to break a tie the context cannot", () => {
    const first = matchQuote(PAGE, "rose in the first quarter", { hint: 0 });
    const second = matchQuote(PAGE, "rose in the first quarter", { hint: PAGE.length });
    expect(first!.start).toBeLessThan(second!.start);
  });

  it("scores a match whose surroundings changed below one that kept them", () => {
    const kept = matchQuote(PAGE, "approved the plan", { prefix: "and " });
    const lost = matchQuote(PAGE, "approved the plan", { prefix: "xxxx" });
    expect(kept!.score).toBeGreaterThan(lost!.score);
    expect(kept!.start).toBe(lost!.start);
  });

  it("does not penalise a quote that recorded no context", () => {
    expect(matchQuote(PAGE, "approved the plan", {})?.score).toBe(1);
  });

  it("finds a quote at the very start of the text", () => {
    expect(quoted(PAGE, matchQuote(PAGE, "Revenue rose"))).toBe("Revenue rose");
  });

  it("gives up when more than half the quote changed", () => {
    expect(matchQuote(PAGE, "approved xxxxxxxxxxxxxxxxx")).toBeUndefined();
  });

  it("scores a badly degraded quote low enough for a caller to reject it", () => {
    const match = matchQuote(PAGE, "approved xxx xxxx");
    expect(match?.score).toBeLessThan(0.8);
  });
});
