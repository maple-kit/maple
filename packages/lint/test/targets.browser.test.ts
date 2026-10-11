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

  it("caps per rule and in all, and counts what it left out", () => {
    mount(`<article>1</article><article>2</article><article>3</article>`);
    const other = { ...rule, id: "acme/other" };
    const read = readPage({ rules: [rule, other], maxPerRule: 2, maxTargets: 3 }).judged;
    expect(read.targets.map((one) => one.rule)).toEqual(["acme/card", "acme/card", "acme/other"]);
    expect(read.dropped).toBe(3);
  });

  it("names a rule whose selector is invalid and carries on", () => {
    mount(`<article>1</article>`);
    const bad = { ...rule, id: "acme/bad", appliesTo: "article[" };
    const read = readPage({ rules: [bad, rule] }).judged;
    expect(read.invalid).toEqual(["acme/bad"]);
    expect(read.targets).toHaveLength(1);
  });
});
