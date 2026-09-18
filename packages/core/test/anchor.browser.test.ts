import { afterEach, describe, expect, it } from "vitest";

import {
  describeElement,
  describeRange,
  OVERLAY_MARKER,
  resolveAnchor,
} from "../src/anchor/index.js";

import type { Anchor, Resolved } from "../src/anchor/index.js";

let container: HTMLElement;

function mount(html: string): HTMLElement {
  container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

function resolved(anchor: Anchor): Resolved {
  const outcome = resolveAnchor(anchor, { root: container });
  if (outcome.status !== "resolved") throw new Error(`orphaned: ${outcome.reason}`);
  return outcome;
}

afterEach(() => container.remove());

describe("describing an element", () => {
  it("records every rung the page can supply", () => {
    const root = mount(
      `<p data-maple-key="msg:1" data-maple-src="src/App.tsx:4:3" data-maple-name="Message">Hello there</p>`,
    );
    const anchor = describeElement(root.querySelector("p")!, { root });

    expect(anchor.key).toBe("msg:1");
    expect(anchor.source).toBe("src/App.tsx:4:3");
    expect(anchor.component).toBe("Message");
    expect(anchor.quote?.exact).toBe("Hello there");
    expect(anchor.selector).toBeTypeOf("string");
  });

  it("inherits the attributes from the nearest ancestor that carries them", () => {
    const root = mount(`<section data-maple-name="Card"><b>Inner</b></section>`);
    expect(describeElement(root.querySelector("b")!, { root }).component).toBe("Card");
  });

  it("records surrounding text so two identical passages can be told apart", () => {
    const root = mount(`<p>Costs rose sharply</p><p>Revenue rose sharply</p>`);
    const anchor = describeElement(root.querySelectorAll("p")[1]!, { root });
    expect(anchor.quote?.prefix).toBe("Costs rose sharply");
  });

  it("caps a long passage but still records where it started", () => {
    const root = mount(`<p>${"word ".repeat(200)}</p>`);
    const anchor = describeElement(root.querySelector("p")!, { root, maximumQuote: 50 });
    expect(anchor.quote?.exact).toHaveLength(50);
    expect(anchor.quote?.offset).toBe(0);
  });

  it("describes a selected passage rather than a whole element", () => {
    const root = mount(`<p>The board approved the plan today</p>`);
    const text = root.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 10);
    range.setEnd(text, 27);

    expect(describeRange(range, { root }).quote?.exact).toBe("approved the plan");
  });
});

describe("resolving an anchor", () => {
  it("prefers the key, which survives a rebuild and a rewrite", () => {
    const root = mount(`<p data-maple-key="msg:1" data-maple-src="old.tsx:1:1">Text</p>`);
    const outcome = resolved({ key: "msg:1", source: "gone.tsx:9:9" });

    expect(outcome.by).toBe("key");
    expect(outcome.element).toBe(root.querySelector("p"));
    expect(outcome.confidence).toBe(1);
  });

  it("falls to the source location when there is no key", () => {
    mount(`<p data-maple-src="src/App.tsx:4:3">Text</p>`);
    expect(resolved({ source: "src/App.tsx:4:3" }).by).toBe("source");
  });

  it("falls to the component name when the line has moved", () => {
    mount(`<p data-maple-src="src/App.tsx:9:3" data-maple-name="Message">Text</p>`);
    const outcome = resolved({ source: "src/App.tsx:4:3", component: "Message" });
    expect(outcome.by).toBe("component");
    expect(outcome.confidence).toBeLessThan(1);
  });

  it("uses the quote to choose between elements sharing a component name", () => {
    const root = mount(
      `<p data-maple-name="Row">Costs rose</p><p data-maple-name="Row">Revenue rose</p>`,
    );
    const outcome = resolved({ component: "Row", quote: { exact: "Revenue rose" } });
    expect(outcome.element).toBe(root.querySelectorAll("p")[1]);
  });

  it("falls to the quote when the build stopped tagging altogether", () => {
    const root = mount(`<article><p>The board approved the plan</p></article>`);
    const outcome = resolved({ quote: { exact: "approved the plan" } });

    expect(outcome.by).toBe("quote");
    expect(outcome.element).toBe(root.querySelector("p"));
    expect(outcome.range?.toString()).toBe("approved the plan");
  });

  it("still finds a passage a few words of which changed, with less confidence", () => {
    mount(`<p>The board approved the revised plan</p>`);
    const outcome = resolved({ quote: { exact: "approved the plan" } });
    expect(outcome.by).toBe("quote");
    expect(outcome.confidence).toBeLessThan(0.8);
  });

  it("falls to the selector last of all", () => {
    const root = mount(`<section><i>a</i><i>b</i></section>`);
    const outcome = resolved({ selector: "section > i:nth-of-type(2)" });
    expect(outcome.by).toBe("selector");
    expect(outcome.element).toBe(root.querySelectorAll("i")[1]);
  });

  it("round-trips: an element described and resolved is the same element", () => {
    const root = mount(`<ul><li>one</li><li>two</li><li>three</li></ul>`);
    const target = root.querySelectorAll("li")[2]!;
    expect(resolved(describeElement(target, { root })).element).toBe(target);
  });

  it("never anchors to Maple's own overlay", () => {
    const root = mount(
      `<div ${OVERLAY_MARKER}><p>approved the plan</p></div><main><p>approved the plan</p></main>`,
    );
    expect(resolved({ quote: { exact: "approved the plan" } }).element).toBe(
      root.querySelector("main p"),
    );
  });
});

describe("orphaning", () => {
  it("says so when nothing was recorded", () => {
    mount(`<p>Text</p>`);
    expect(resolveAnchor({}, { root: container })).toMatchObject({
      status: "orphaned",
      reason: "empty",
      tried: [],
    });
  });

  it("says the element is missing when no rung matches", () => {
    mount(`<p>Text</p>`);
    expect(resolveAnchor({ key: "gone", selector: "b" }, { root: container })).toMatchObject({
      status: "orphaned",
      reason: "missing",
      tried: ["key", "selector"],
    });
  });

  it("says the passage changed rather than snapping to an ancestor", () => {
    mount(`<article><p>Something else entirely, unrelated</p></article>`);
    expect(
      resolveAnchor({ quote: { exact: "approved the plan" } }, { root: container }),
    ).toMatchObject({
      status: "orphaned",
      reason: "missing",
    });
  });

  it("says the match is ambiguous when several match and nothing separates them", () => {
    mount(`<p data-maple-name="Row">a</p><p data-maple-name="Row">b</p>`);
    expect(resolveAnchor({ component: "Row" }, { root: container })).toMatchObject({
      status: "orphaned",
      reason: "ambiguous",
    });
  });

  it("reports every rung it tried, so a reviewer can be told what was looked for", () => {
    mount(`<p>Text</p>`);
    const outcome = resolveAnchor(
      { key: "gone", source: "gone.tsx:1:1", component: "Gone", selector: "b" },
      { root: container },
    );
    expect(outcome).toMatchObject({ tried: ["key", "source", "component", "selector"] });
  });
});
