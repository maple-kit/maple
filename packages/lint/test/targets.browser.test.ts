import { afterEach, describe, expect, it } from "vitest";

import { readPage, TRUNCATED } from "../src/rendered/collect.js";

let container: HTMLElement;

function mount(html: string): void {
  container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
}

afterEach(() => container.remove());

const rule = { id: "acme/card", question: "Is it a card?", appliesTo: "article" };

describe("what is sent to the judge", () => {
  it("serialises the subtree without scripts or styles", () => {
    mount(
      `<article data-maple-src="a.tsx:1:1"><h2>T</h2><script>alert(1)</script><style>h2{}</style></article>`,
    );
    const { targets } = readPage({ rules: [rule] }).judged;
    expect(targets).toHaveLength(1);
    expect(targets[0]?.html).toBe(`<article data-maple-src="a.tsx:1:1"><h2>T</h2></article>`);
    expect(targets[0]?.anchor.source).toBe("a.tsx:1:1");
  });

  it("reads nothing for the judge unless rules are given", () => {
    mount(`<article>x</article>`);
    expect(readPage().judged.targets).toEqual([]);
  });

  it("cuts a long subtree and says so", () => {
    mount(`<article>${"x".repeat(100)}</article>`);
    const { targets } = readPage({ rules: [rule], maxHtml: 20 }).judged;
    expect(targets[0]?.html).toBe(`<article>xxxxxxxxxxx${TRUNCATED}`);
  });

  it("sends one representative for repeats, and counts the rest", () => {
    const card = (n: number) =>
      `<article data-maple-src="a.tsx:1:1" id="c${n}"><h2>Item ${n}</h2><a href="/p/${n}">go</a></article>`;
    mount([1, 2, 3, 4].map(card).join("") + `<article data-maple-src="b.tsx:2:2">other</article>`);
    const read = readPage({ rules: [rule] }).judged;
    expect(read.targets).toHaveLength(2);
    expect(read.repeats).toEqual([3, 0]);
    expect(read.targets[0]?.anchor.source).toBe("a.tsx:1:1");
    expect(read.stats).toMatchObject({ matched: 5, groups: 2, sent: 2, droppedByCap: 0 });
  });

  it("tells the same markup apart when it was written in two places", () => {
    mount(
      `<article data-maple-src="a.tsx:1:1">x</article><article data-maple-src="b.tsx:1:1">x</article>`,
    );
    expect(readPage({ rules: [rule] }).judged.targets).toHaveLength(2);
  });

  it("caps groups per rule and in all, and says which rules hit it", () => {
    mount(
      `<article class="a">1</article><article class="b">2</article><article class="c">3</article>`,
    );
    const other = { ...rule, id: "acme/other" };
    const read = readPage({ rules: [rule, other], maxPerRule: 2, maxTargets: 3 }).judged;
    expect(read.targets.map((one) => one.rule)).toEqual(["acme/card", "acme/card", "acme/other"]);
    expect(read.stats).toMatchObject({
      matched: 6,
      groups: 6,
      sent: 3,
      droppedByCap: 3,
      rulesAtCap: ["acme/card", "acme/other"],
      broadRules: [],
    });
  });

  it("marks a rule whose groups are far over its cap as broad", () => {
    mount([..."abcdefg"].map((n) => `<article class="k${n}">x</article>`).join(""));
    const read = readPage({ rules: [rule], maxPerRule: 2 }).judged;
    expect(read.stats.broadRules).toEqual(["acme/card"]);
  });

  it("judges changed files first and skips the rest", () => {
    mount(
      `<article data-maple-src="old.tsx:1:1">o</article>` +
        `<article>untagged</article>` +
        `<article data-maple-src="src/new.tsx:3:1">n</article>`,
    );
    const read = readPage({ rules: [rule], sources: ["src/new.tsx"], maxPerRule: 2 }).judged;
    expect(read.targets.map((one) => one.anchor.source)).toEqual(["src/new.tsx:3:1", undefined]);
    expect(read.stats).toMatchObject({ notChanged: 1, droppedByCap: 0 });
  });

  it("falls back to the cap when untagged elements outnumber the room", () => {
    mount(
      `<article class="a">1</article><article class="b">2</article><article class="c">3</article>`,
    );
    const read = readPage({ rules: [rule], sources: ["x.tsx"], maxPerRule: 2 }).judged;
    expect(read.targets).toHaveLength(2);
    expect(read.stats.droppedByCap).toBe(1);
  });

  it("names a rule whose selector is invalid and carries on", () => {
    mount(`<article>1</article>`);
    const bad = { ...rule, id: "acme/bad", appliesTo: "article[" };
    const read = readPage({ rules: [bad, rule] }).judged;
    expect(read.stats.invalidSelectors).toEqual(["acme/bad"]);
    expect(read.targets).toHaveLength(1);
  });
});
