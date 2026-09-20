import { describe, expect, it } from "vitest";

import { BLOCKING_STATUSES, decideGate } from "../src/gate/decide.js";
import { storedComment } from "../src/testing/fixtures.js";

import type { CommentStatus, GateReason } from "../src/types.js";

function at(status: CommentStatus, body = "Fix the spacing") {
  return storedComment({ id: `c_${status}`, status, body });
}

describe("what holds the gate", () => {
  it.each<[CommentStatus, boolean]>([
    ["open", true],
    ["needs_reverify", true],
    ["orphaned", true],
    ["resolved", false],
  ])("a %s comment blocks: %s", (status, blocks) => {
    const verdict = decideGate([at(status)]);
    expect(verdict.conclusion).toBe(blocks ? "blocked" : "clear");
    expect(verdict.open).toBe(blocks ? 1 : 0);
  });

  it("names every blocking status in the exported default", () => {
    expect([...BLOCKING_STATUSES].toSorted((a, b) => a.localeCompare(b))).toEqual([
      "needs_reverify",
      "open",
      "orphaned",
    ]);
  });

  it("takes a narrower policy when one is given", () => {
    const verdict = decideGate([at("orphaned")], { blockOn: ["open"] });
    expect(verdict.conclusion).toBe("clear");
  });
});

describe("the three ways of having nothing to say", () => {
  it.each<[string, GateReason, ReturnType<typeof decideGate>]>([
    ["comments that could not be read", "unreadable", decideGate(undefined)],
    [
      "a store that cannot record status",
      "status-untracked",
      decideGate([], { statusTracked: false }),
    ],
    [
      "a pull request Maple never reviewed",
      "no-review",
      decideGate(undefined, { hasReview: false }),
    ],
  ])("%s is neutral, not clear", (_, reason, verdict) => {
    expect(verdict.conclusion).toBe("neutral");
    expect(verdict.reason).toBe(reason);
    expect(verdict.open).toBe(0);
  });

  it("does not block on an untracked store even with open comments", () => {
    expect(decideGate([at("open")], { statusTracked: false }).conclusion).toBe("neutral");
  });

  it("keeps a pull request out of scope apart from one Maple could not read", () => {
    expect(decideGate(undefined, { hasReview: false }).summary).not.toContain("could not read");
    expect(decideGate(undefined).summary).toContain("could not read");
  });

  it("says nothing was reviewed even when comments were handed to it", () => {
    expect(decideGate([at("open")], { hasReview: false }).conclusion).toBe("neutral");
  });
});

describe("the two ways of being clear", () => {
  it("separates a pull request nobody commented on from one fully resolved", () => {
    expect(decideGate([]).reason).toBe("no-comments");
    expect(decideGate([at("resolved")]).reason).toBe("all-resolved");
  });
});

describe("what a person reads", () => {
  it("numbers an open comment as the export table numbers it", () => {
    const verdict = decideGate([at("resolved", "done"), at("open", "still wrong")]);
    expect(verdict.summary).toContain("2. `DashboardHeader` — still wrong");
    expect(verdict.summary).not.toContain("1. ");
  });

  it("counts against the total, not against the blocking ones", () => {
    const verdict = decideGate([at("open"), at("resolved"), at("orphaned")]);
    expect(verdict.title).toBe("2 of 3 comments still open");
    expect(verdict).toMatchObject({ open: 2, total: 3 });
  });

  it("says a single comment in the singular", () => {
    expect(decideGate([at("open")]).title).toBe("1 of 1 comment still open");
  });

  it("marks why a comment that nobody reopened is still blocking", () => {
    expect(decideGate([at("needs_reverify")]).summary).toContain("needs re-checking");
    expect(decideGate([at("orphaned")]).summary).toContain("(unpinned)");
  });

  it("flattens a body, because a list item ends at a newline", () => {
    const verdict = decideGate([storedComment({ status: "open", body: "one\n\ntwo" })]);
    expect(verdict.summary).toContain("one two");
  });

  it("stops naming comments after ten and says how many it did not name", () => {
    const many = Array.from({ length: 13 }, (_, index) =>
      storedComment({ id: `c_${String(index)}`, status: "open" }),
    );
    const verdict = decideGate(many);
    expect(verdict.summary).toContain("…and 3 more.");
    expect(verdict.open).toBe(13);
  });
});
