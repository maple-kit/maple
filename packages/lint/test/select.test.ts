import { describe, expect, it } from "vitest";

import { mergeStats } from "../src/rendered/audit.js";
import { choose, groupBySignature, signatureOf, sourceFile } from "../src/rendered/select.js";

import type { Pass } from "../src/rendered/audit.js";
import type { JudgedStats } from "../src/rendered/collect.js";

describe("sourceFile", () => {
  it.each([
    ["src/Card.tsx:12:4", "src/Card.tsx"],
    ["src/Card.tsx:12", "src/Card.tsx"],
    ["src/Card.tsx", "src/Card.tsx"],
  ])("%s is %s", (source, file) => expect(sourceFile(source)).toBe(file));
});

describe("signatureOf", () => {
  it.each([
    ["class digits keep groups apart", '<li class="p-2">#</li>', '<li class="p-4">#</li>', false],
    ["whitespace is collapsed", "<li>\n  #</li>", "<li> #</li>", true],
    ["a different tag is a different component", "<li>#</li>", "<p>#</p>", false],
    ["a different class is a different component", '<i class="a">', '<i class="b">', false],
  ])("%s", (_name, a, b, same) => {
    expect(signatureOf("a.tsx:1:1", a) === signatureOf("a.tsx:1:1", b)).toBe(same);
  });

  it("separates the same markup written in two places", () => {
    expect(signatureOf("a.tsx:1:1", "<i>")).not.toBe(signatureOf("b.tsx:1:1", "<i>"));
  });
});

const item = (signature: string, source?: string) => ({ signature, source });

describe("groupBySignature", () => {
  it("keeps the first of each group, in DOM order, and counts them", () => {
    const first = item("a");
    const groups = groupBySignature([first, item("b"), item("a"), item("a")]);
    expect(groups.map((g) => g.size)).toEqual([3, 1]);
    expect(groups[0]?.first).toBe(first);
  });
});

describe("choose", () => {
  const groups = groupBySignature([
    item("1", "other.tsx:1:1"),
    item("2"),
    item("3", "src/Card.tsx:5:2"),
    item("4", "src/Nav.tsx:5:2"),
  ]);

  it("applies the room alone when no sources are given", () => {
    const chosen = choose(groups, 3);
    expect(chosen.kept.map((g) => g.first.signature)).toEqual(["1", "2", "3"]);
    expect(chosen).toMatchObject({ capped: 1, notChanged: 0 });
  });

  it("puts changed files first, then untagged, and skips other files", () => {
    const chosen = choose(groups, 10, ["src/Card.tsx", "src/Nav.tsx"]);
    expect(chosen.kept.map((g) => g.first.signature)).toEqual(["3", "4", "2"]);
    expect(chosen).toMatchObject({ capped: 0, notChanged: 1 });
  });

  it("gives untagged elements only what the changed ones leave", () => {
    const chosen = choose(groups, 2, ["./src/Card.tsx", "src/Nav.tsx"]);
    expect(chosen.kept.map((g) => g.first.signature)).toEqual(["3", "4"]);
    expect(chosen.capped).toBe(1);
  });

  it("matches an absolute source path by its tail", () => {
    const rooted = groupBySignature([item("x", "/ci/work/src/Card.tsx:1:1")]);
    expect(choose(rooted, 5, ["src/Card.tsx"]).kept).toHaveLength(1);
  });

  it("keeps nothing when there is no room", () => {
    expect(choose(groups, 0).kept).toEqual([]);
  });
});

describe("mergeStats", () => {
  const stats = (over: Partial<JudgedStats>): JudgedStats => ({
    matched: 0,
    groups: 0,
    sent: 0,
    droppedByCap: 0,
    notChanged: 0,
    rulesAtCap: [],
    broadRules: [],
    invalidSelectors: [],
    ...over,
  });
  const pass = (judgedStats?: JudgedStats) => ({ judgedStats }) as unknown as Pass;

  it("is absent when nothing was judged", () => {
    expect(mergeStats([pass(), pass()])).toBeUndefined();
  });

  it("takes the largest counts and the union of the rules", () => {
    const merged = mergeStats([
      pass(stats({ matched: 87, sent: 12, rulesAtCap: ["a"], broadRules: ["a"] })),
      pass(stats({ matched: 90, sent: 9, rulesAtCap: ["a", "b"], invalidSelectors: ["c"] })),
    ]);
    expect(merged).toMatchObject({
      matched: 90,
      sent: 12,
      rulesAtCap: ["a", "b"],
      broadRules: ["a"],
      invalidSelectors: ["c"],
    });
  });
});
