import { useMapleClient } from "@maple-kit/react";
import { createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import {
  LEAF_OUTLINE,
  MapleAvatar,
  MapleMark,
  MapleMarkLayer,
  MapleTargetRing,
} from "../src/marks/index.js";
import { offlineFetch } from "./offline.js";

import type { MarkLayerProps, MarkProps, TargetRingProps } from "../src/marks/index.js";
import type { Comment } from "@maple-kit/core";
import type { ReactElement, ReactNode } from "react";

const BRANCH = "feat/ui-marks";

const CONTEXT = {
  url: "https://example.test/dashboard",
  viewportWidth: 1280,
  viewportHeight: 900,
  contentWidth: 1280,
  devicePixelRatio: 2,
  colorScheme: "light",
} as const;

/** The overlay's container, which is `:host` in the adopted stylesheet. */
function container(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!found) throw new Error("no overlay is mounted");
  return found;
}

function root(): ShadowRoot {
  const shadow = container().shadowRoot;
  if (!shadow) throw new Error("the overlay has no shadow root");
  return shadow;
}

function token(name: string): string {
  return getComputedStyle(container()).getPropertyValue(name).trim();
}

/** A comment whose anchor is the key its id names, so a fixture answers it. */
function comment(id: string, over: Partial<Comment> = {}): Comment {
  return {
    id,
    branch: BRANCH,
    body: "The number here does not match the export.",
    status: "open",
    createdAt: "2026-01-04T10:00:00.000Z",
    author: { id: "sam", name: "Sam", provenance: "server", colorSlot: 6 },
    anchor: { key: id },
    context: CONTEXT,
    ...over,
  };
}

/** One anchored element on the page under review, at a known place. */
function fixture(key: string, box: { x: number; y: number; w: number; h: number }): HTMLElement {
  const node = document.createElement("div");
  node.className = "fixture";
  node.setAttribute("data-maple-key", key);
  node.style.setProperty("position", "absolute");
  node.style.setProperty("left", `${box.x}px`);
  node.style.setProperty("top", `${box.y}px`);
  node.style.setProperty("width", `${box.w}px`);
  node.style.setProperty("height", `${box.h}px`);
  document.body.append(node);
  return node;
}

function mounted(children: ReactNode): ReactElement {
  return createElement(MapleRoot, { branch: BRANCH, options: { fetch: offlineFetch() } }, children);
}

function layer(props: MarkLayerProps): ReactElement {
  return mounted(createElement(MapleMarkLayer, props));
}

async function drawn(count: number): Promise<HTMLElement[]> {
  await vi.waitFor(() => expect(root().querySelectorAll(".mk-mark")).toHaveLength(count));
  return [...root().querySelectorAll<HTMLElement>(".mk-mark")];
}

async function ring(): Promise<HTMLElement> {
  await vi.waitFor(() => expect(root().querySelector(".mk-ring")).not.toBeNull());
  return root().querySelector<HTMLElement>(".mk-ring")!;
}

function y(node: HTMLElement): number {
  return Number.parseFloat(node.style.getPropertyValue("--mk-y"));
}

/** A hit area is the 40px square centred on the mark, wherever it was drawn. */
function hitArea(mark: HTMLElement): DOMRect {
  const rect = mark.getBoundingClientRect();
  const size = Number.parseFloat(getComputedStyle(mark, "::after").width);
  return new DOMRect(
    rect.x + rect.width / 2 - size / 2,
    rect.y + rect.height / 2 - size / 2,
    size,
    size,
  );
}

function overlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  document.body.style.setProperty("height", "3000px");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.body.style.removeProperty("height");
  window.scrollTo(0, 0);
  for (const node of document.querySelectorAll(".fixture")) node.remove();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/**
 * Fill says how far through its life a comment is, the edge says how sure the
 * anchor is, colour says its status. None of the three shares a pixel.
 */
/**
 * The leaf fills up as a comment goes through its life: open is an outline,
 * re-verify is half, resolved is full. One never written is grey.
 */
describe("the three forms", () => {
  async function mark(props: Partial<MarkProps>): Promise<HTMLElement> {
    await render(mounted(createElement(MapleMark, { address: 1, ...props })));
    await vi.waitFor(() => expect(root().querySelector(".mk-mark")).not.toBeNull());
    return root().querySelector<HTMLElement>(".mk-mark")!;
  }

  it("outlines an open comment, in the accent", async () => {
    const node = await mark({ status: "open" });
    const edge = node.querySelector(".mk-leaf-edge")!;

    expect(node.getAttribute("data-form")).toBe("outline");
    expect(node.querySelector("clipPath")).toBeNull();
    expect(edge.getAttribute("d")).toBe(LEAF_OUTLINE);
    expect(getComputedStyle(edge).fill).toBe(token("--mk-accent"));
    expect(getComputedStyle(edge).stroke).toBe(token("--mk-accent"));
    expect(Number.parseFloat(getComputedStyle(edge).strokeWidth)).toBeGreaterThan(1);
  });

  it("half fills one that needs re-verifying, in amber", async () => {
    const node = await mark({ status: "needs_reverify" });

    expect(node.getAttribute("data-form")).toBe("partial");
    expect(node.querySelector("clipPath rect")).not.toBeNull();
    expect(node.querySelectorAll(".mk-leaf-body")).toHaveLength(1);
    expect(getComputedStyle(node.querySelector(".mk-leaf-edge")!).fill).toBe(token("--mk-warn"));
  });

  it("fills a resolved one whole, in green, and holds it back", async () => {
    const node = await mark({ status: "resolved" });
    const body = node.querySelector(".mk-leaf-body")!;

    expect(node.getAttribute("data-form")).toBe("solid");
    expect(node.querySelector("clipPath")).toBeNull();
    expect(node.querySelector(".mk-leaf-edge")).toBeNull();
    expect(getComputedStyle(body).fill).toBe(token("--mk-ok"));
    await vi.waitFor(() => expect(getComputedStyle(node).opacity).toBe("0.85"));
  });

  it("outlines one that has not been sent, in grey rather than a status", async () => {
    const node = await mark({ sent: false });
    const edge = node.querySelector(".mk-leaf-edge")!;

    expect(node.getAttribute("data-form")).toBe("outline");
    expect(node.getAttribute("data-sent")).toBe("false");
    expect(getComputedStyle(edge).strokeDasharray).toBe("none");
    expect(getComputedStyle(edge).fill).toBe(token("--mk-muted"));
    expect(getComputedStyle(edge).stroke).toBe(token("--mk-muted"));
  });

  it("outlines an unpinned one in grey too, for the same reason", async () => {
    const node = await mark({ status: "orphaned" });

    expect(node.getAttribute("data-form")).toBe("outline");
    expect(getComputedStyle(node.querySelector(".mk-leaf-edge")!).fill).toBe(token("--mk-muted"));
  });

  /**
   * The leaf's mass is below its middle, so a box-centred number reads high
   * inside it.
   */
  it("sets the number below the box's middle, where the leaf's middle is", async () => {
    const node = await mark({ address: 1 });
    const number = node.querySelector<HTMLElement>(".mk-mark-n")!;
    const shift = new DOMMatrix(getComputedStyle(number).transform).m42;

    expect(shift).toBeGreaterThan(0);
  });

  it("counts a number's digits onto it, so the rules have something to key off", async () => {
    const node = await mark({ address: 128 });

    expect(node.querySelector(".mk-mark-n")!.getAttribute("data-mk-digits")).toBe("3");
  });

  /** A mark that changed size at the tenth comment would be a second object. */
  it("shrinks the number rather than the leaf once it runs to two digits", async () => {
    await render(
      mounted(
        createElement(
          "div",
          null,
          createElement(MapleMark, { key: "a", address: 7 }),
          createElement(MapleMark, { key: "b", address: 12 }),
          createElement(MapleMark, { key: "c", address: 128 }),
        ),
      ),
    );
    await vi.waitFor(() => expect(root().querySelectorAll(".mk-mark")).toHaveLength(3));

    const marks = [...root().querySelectorAll<HTMLElement>(".mk-mark")];
    const size = (node: HTMLElement) =>
      Number.parseFloat(getComputedStyle(node.querySelector(".mk-mark-n")!).fontSize);

    expect(size(marks[0]!)).toBeGreaterThan(size(marks[1]!));
    expect(size(marks[1]!)).toBeGreaterThan(size(marks[2]!));
    expect(new Set(marks.map((one) => one.getBoundingClientRect().width)).size).toBe(1);
  });

  it("thins the fill of a weak anchor and leaves its edge solid", async () => {
    const node = await mark({ status: "needs_reverify", confidence: 0.5 });

    expect(node.getAttribute("data-confidence")).toBe("weak");
    expect(getComputedStyle(node.querySelector(".mk-leaf-body")!).fillOpacity).toBe("0.42");
    expect(getComputedStyle(node.querySelector(".mk-leaf-edge")!).fillOpacity).toBe("1");
  });

  it("carries the address, the name and the status without opening anything", async () => {
    const node = await mark({
      address: 4,
      author: "Priya",
      status: "resolved",
      on: "the Yield card",
    });

    expect(node.textContent).toBe("4");
    expect(node.getAttribute("aria-label")).toBe("Comment 4 by Priya, Resolved");
    expect(node.getAttribute("title")).toBe("Priya · Resolved · the Yield card");
  });

  it("lands once, over 500ms, and never transitions its position", async () => {
    const node = await mark({});
    const style = getComputedStyle(node);

    expect(style.animationName).toBe("mk-mark-in");
    expect(style.animationDuration).toBe("0.5s");
    expect(style.transitionProperty).toBe("transform, opacity");
  });
});

/** The clip sits outside the rotation, so the waterline stays horizontal. */
describe("the waterline", () => {
  it("stays horizontal while the leaf stays tilted", async () => {
    await render(mounted(createElement(MapleMark, { address: 1, status: "needs_reverify" })));
    await vi.waitFor(() => expect(root().querySelector("clipPath rect")).not.toBeNull());

    const rect = root().querySelector<SVGGraphicsElement>("clipPath rect")!;
    const leaf = root().querySelector<SVGGraphicsElement>(".mk-leaf-body")!;

    expect(rect.getCTM()!.b).toBe(0);
    expect(rect.getCTM()!.c).toBe(0);
    expect(leaf.getCTM()!.b).not.toBe(0);
    expect(rect.closest("g[transform]")).toBeNull();
  });

  it("fills from the bottom edge of the rotated box upward", async () => {
    await render(mounted(createElement(MapleMark, { address: 1, status: "needs_reverify" })));
    await vi.waitFor(() => expect(root().querySelector("clipPath rect")).not.toBeNull());

    const rect = root().querySelector("clipPath rect")!;
    expect(rect.getAttribute("y")).toBe("32");
    expect(rect.getAttribute("height")).toBe("39");
    expect(rect.getAttribute("x")).toBe("-7");
  });

  it("gives every instance in the shadow root a clip id of its own", async () => {
    await render(
      mounted([
        createElement(MapleMark, { key: "a", address: 1, status: "needs_reverify" }),
        createElement(MapleMark, { key: "b", address: 2, status: "needs_reverify" }),
      ]),
    );
    await vi.waitFor(() => expect(root().querySelectorAll("clipPath")).toHaveLength(2));

    const ids = [...root().querySelectorAll("clipPath")].map((clip) => clip.id);
    expect(new Set(ids).size).toBe(2);

    const used = [...root().querySelectorAll("g[clip-path]")].map((g) =>
      g.getAttribute("clip-path"),
    );
    expect(used).toEqual(ids.map((id) => `url(#${id})`));
  });
});

/**
 * The ring is not scaffolding: without it the composer asks a reviewer to
 * remember what they clicked, and they do not.
 */
describe("the ring", () => {
  async function around(props: TargetRingProps): Promise<HTMLElement> {
    await render(mounted(createElement(MapleTargetRing, props)));
    return ring();
  }

  it("sits three pixels outside what it names, and says what that is", async () => {
    const target = fixture("kpi-yield", { x: 120, y: 400, w: 300, h: 90 });
    const node = await around({ target, label: "the Yield card" });

    expect(node.style.getPropertyValue("--mk-x")).toBe("117px");
    expect(node.style.getPropertyValue("--mk-w")).toBe("306px");
    expect(root().querySelector(".mk-ring-label")!.textContent).toBe("the Yield card");
  });

  it("follows the element it names as the page scrolls under it", async () => {
    const step = Math.round(window.innerHeight / 4);
    const target = fixture("kpi-yield", { x: 120, y: window.innerHeight / 2, w: 300, h: 90 });
    const node = await around({ target });
    const before = y(node);

    window.scrollTo(0, step);
    await vi.waitFor(() => expect(y(node)).toBe(before - step));
    expect(y(node)).toBe(Math.round(target.getBoundingClientRect().y) - 3);
  });

  it("carries no transition on its position, which would lag the page", async () => {
    const node = await around({ target: fixture("a", { x: 10, y: 60, w: 100, h: 40 }) });
    const style = getComputedStyle(node);

    expect(style.transitionProperty).toBe("opacity");
    expect(style.animationName).toBe("mk-ring-in");
    expect(style.animationDuration).toBe("0.15s");
  });

  it("asks for a layer only while the page is moving under it", async () => {
    const node = await around({ target: fixture("a", { x: 10, y: 60, w: 100, h: 40 }) });
    expect(getComputedStyle(node).willChange).toBe("auto");

    node.toggleAttribute("data-mk-moving", true);
    expect(getComputedStyle(node).willChange).toBe("transform");

    node.toggleAttribute("data-mk-moving", false);
    expect(getComputedStyle(node).willChange).toBe("auto");
  });

  it("stops drawing what has scrolled far enough away", async () => {
    const node = await around({ target: fixture("a", { x: 10, y: 60, w: 100, h: 40 }) });
    expect(node.hasAttribute("data-mk-off")).toBe(false);

    window.scrollTo(0, window.innerHeight + 200);
    await vi.waitFor(() => expect(node.hasAttribute("data-mk-off")).toBe(true));
    expect(getComputedStyle(node).visibility).toBe("hidden");
  });

  /**
   * The rectangle is the comment. Ringing the element it was measured in said
   * "the metric row" about a comment pointing at the gap between two cards.
   */
  it("draws the rectangle a region recorded, not the box it was measured in", async () => {
    const target = fixture("split", { x: 100, y: 200, w: 400, h: 200 });
    const node = await around({
      target,
      region: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
      label: "an area of the split",
    });

    expect(node.getAttribute("data-mk-region")).toBe("true");
    expect(node.style.getPropertyValue("--mk-x")).toBe("197px");
    expect(node.style.getPropertyValue("--mk-y")).toBe("297px");
    expect(node.style.getPropertyValue("--mk-w")).toBe("206px");
    expect(node.style.getPropertyValue("--mk-h")).toBe("56px");
  });

  it("fills a region as well as outlining it, because an area is not a thing", async () => {
    const target = fixture("split", { x: 100, y: 200, w: 400, h: 200 });
    const node = await around({ target, region: { x: 0, y: 0, width: 1, height: 1 } });
    const plain = getComputedStyle(node).backgroundColor;

    expect(plain).not.toBe("rgba(0, 0, 0, 0)");
    expect(root().querySelectorAll(".mk-ring-run")).toHaveLength(0);
  });

  it("moves a region with its container rather than holding a pixel offset", async () => {
    const target = fixture("split", { x: 100, y: 200, w: 400, h: 200 });
    const node = await around({ target, region: { x: 0.5, y: 0, width: 0.5, height: 1 } });
    expect(node.style.getPropertyValue("--mk-x")).toBe("297px");

    target.style.left = "200px";
    window.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => expect(node.style.getPropertyValue("--mk-x")).toBe("397px"));
  });

  it("draws one rectangle per line of a passage", async () => {
    const paragraph = fixture("retention", { x: 40, y: 300, w: 90, h: 200 });
    paragraph.textContent =
      "Retention holds at the numbers this page reports, which wraps over several lines.";

    const range = document.createRange();
    range.selectNodeContents(paragraph.firstChild!);
    const lines = range.getClientRects().length;
    expect(lines).toBeGreaterThan(1);

    await around({ target: range, label: "a passage in the retention paragraph" });
    await vi.waitFor(() => expect(root().querySelectorAll(".mk-ring-run")).toHaveLength(lines));

    const runs = [...root().querySelectorAll<HTMLElement>(".mk-ring-run")];
    const tops = runs.map((run) => Number.parseFloat(run.style.getPropertyValue("--mk-y")));
    expect(new Set(tops).size).toBe(lines);
  });

  it("moves its label below the anchor when there is no room above", async () => {
    await around({ target: fixture("a", { x: 10, y: 4, w: 100, h: 40 }), label: "the header" });
    const label = root().querySelector(".mk-ring-label")!;

    await vi.waitFor(() => expect(label.hasAttribute("data-mk-below")).toBe(true));
  });

  /* The label is opaque, so one dropped into a line of the page's own text
     hides its middle and leaves both ends showing. Developer detail is where
     it bites: the source line gives it a row the gap cannot hold. */
  it("leaves its label above the anchor while the gap above is the page's own", async () => {
    const target = fixture("card", { x: 120, y: 400, w: 300, h: 90 });
    await around({ target, label: "the Yield card", note: "src/app/cards.tsx:26:7" });
    const label = root().querySelector(".mk-ring-label")!;

    await vi.waitFor(() => expect(root().querySelector(".mk-ring")).not.toBeNull());
    expect(label.hasAttribute("data-mk-below")).toBe(false);
  });

  it("moves it below when the page paints its own text where the label would go", async () => {
    const above = fixture("subtitle", { x: 120, y: 360, w: 300, h: 24 });
    above.textContent = "Every repository with a preview, over the last 28 days.";
    const target = fixture("card", { x: 120, y: 400, w: 300, h: 90 });

    await around({ target, label: "the Yield card", note: "src/app/cards.tsx:26:7" });
    const label = root().querySelector(".mk-ring-label")!;

    await vi.waitFor(() => expect(label.hasAttribute("data-mk-below")).toBe(true));
    expect(label.getBoundingClientRect().top).toBeGreaterThan(above.getBoundingClientRect().bottom);
  });

  /* A short line of text leaves the far end of a wide anchor clear, and the
     far end still points back at the thing the label is naming. */
  it("moves it to the anchor's far end when both edges are written on", async () => {
    const above = fixture("subtitle", { x: 120, y: 360, w: 150, h: 24 });
    above.textContent = "Every repository.";
    const target = fixture("card", { x: 120, y: 400, w: 420, h: 90 });
    const under = fixture("caption", { x: 120, y: 494, w: 150, h: 24 });
    under.textContent = "Twelve weeks.";

    await around({ target, label: "the Yield card", note: "src/app/cards.tsx:26:7" });
    const label = root().querySelector(".mk-ring-label")!;

    await vi.waitFor(() => expect(label.hasAttribute("data-mk-end")).toBe(true));
    expect(label.getBoundingClientRect().left).toBeGreaterThan(above.getBoundingClientRect().right);
  });

  /** Nowhere is better, so it stays where a reader looks for it. */
  it("keeps it above when the page has written on every corner", async () => {
    const above = fixture("subtitle", { x: 120, y: 360, w: 300, h: 24 });
    above.textContent = "Every repository with a preview, over the last 28 days.";
    const target = fixture("card", { x: 120, y: 400, w: 300, h: 90 });
    const under = fixture("caption", { x: 120, y: 494, w: 300, h: 24 });
    under.textContent = "Twelve weeks. The gate landed in week seven, and held.";

    await around({ target, label: "the Yield card", note: "src/app/cards.tsx:26:7" });
    const label = root().querySelector(".mk-ring-label")!;

    await vi.waitFor(() => expect(root().querySelector(".mk-ring")).not.toBeNull());
    expect(label.hasAttribute("data-mk-below")).toBe(false);
    expect(label.hasAttribute("data-mk-end")).toBe(false);
  });
});

/** Every mark on the page, placed so no two of them can be clicked wrong. */
describe("the layer", () => {
  it("draws one mark per pinned comment, inside the shadow root", async () => {
    fixture("c1", { x: 200, y: 300, w: 200, h: 80 });
    fixture("c2", { x: 600, y: 500, w: 200, h: 80 });
    const comments = [comment("c1"), comment("c2")];

    await render(layer({ comments, visible: comments }));
    const marks = await drawn(2);

    expect(document.querySelector(".mk-mark")).toBeNull();
    expect(marks.map((mark) => mark.textContent)).toEqual(["1", "2"]);
  });

  it("gives an unpinned comment no mark on the page at all", async () => {
    fixture("c1", { x: 200, y: 300, w: 200, h: 80 });
    fixture("c6", { x: 200, y: 500, w: 200, h: 80 });
    const comments = [
      comment("c1"),
      comment("c6", { status: "orphaned" }),
      comment("c9", { anchor: { key: "nothing-answers-to-this" } }),
    ];

    await render(layer({ comments, visible: comments }));
    const marks = await drawn(1);

    expect(marks[0]!.textContent).toBe("1");
  });

  it("lifts the mark being answered over the one beside it", async () => {
    fixture("c1", { x: 200, y: 300, w: 60, h: 40 });
    fixture("c2", { x: 220, y: 300, w: 60, h: 40 });
    const comments = [comment("c1"), comment("c2")];

    await render(layer({ comments, visible: comments, selectedId: "c1" }));
    const marks = await drawn(2);

    expect(marks[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(getComputedStyle(marks[0]!).zIndex).toBe("3");
    expect(getComputedStyle(marks[1]!).zIndex).toBe("auto");
  });

  /** A box-shadow on the 38px button draws a rounded square behind a leaf. */
  it("glows in the shape of the leaf rather than behind its box", async () => {
    fixture("c1", { x: 200, y: 300, w: 60, h: 40 });
    const comments = [comment("c1")];

    await render(layer({ comments, visible: comments, selectedId: "c1" }));
    const marks = await drawn(1);

    const style = getComputedStyle(marks[0]!);
    expect(style.boxShadow).toBe("none");
    expect(style.filter).toContain("drop-shadow");
  });

  it("keeps two neighbours' hit areas apart", async () => {
    fixture("c1", { x: 200, y: 300, w: 60, h: 40 });
    fixture("c2", { x: 220, y: 300, w: 60, h: 40 });
    const comments = [comment("c1"), comment("c2")];

    await render(layer({ comments, visible: comments }));
    const marks = await drawn(2);

    expect(hitArea(marks[0]!).width).toBeGreaterThanOrEqual(40);
    expect(overlap(hitArea(marks[0]!), hitArea(marks[1]!))).toBe(false);
  });

  it("follows its anchor as the page scrolls, without a transition", async () => {
    const step = Math.round(window.innerHeight / 4);
    fixture("c1", { x: 200, y: window.innerHeight / 2, w: 200, h: 80 });
    const comments = [comment("c1")];

    await render(layer({ comments, visible: comments }));
    const [mark] = await drawn(1);
    const before = y(mark!);

    window.scrollTo(0, step);
    await vi.waitFor(() => expect(y(mark!)).toBe(before - step));
    expect(getComputedStyle(mark!).transitionProperty).not.toContain("translate");
  });

  it("rings the mark a reviewer is pointing at, and stops the moment they leave", async () => {
    const target = fixture("c1", { x: 200, y: 300, w: 200, h: 80 });
    const comments = [comment("c1")];

    await render(layer({ comments, visible: comments }));
    const [mark] = await drawn(1);

    mark!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const node = await ring();
    expect(node.getAttribute("data-mk-state")).toBe("hovered");
    expect(node.style.getPropertyValue("--mk-x")).toBe(
      `${Math.round(target.getBoundingClientRect().x) - 3}px`,
    );

    mark!.dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
    );
    await vi.waitFor(() => expect(root().querySelector(".mk-ring")).toBeNull());
  });
});

/** While a composer is open the ring belongs to it, and to nothing else. */
describe("the ring while composing", () => {
  function Opener(): null {
    const client = useMapleClient();
    useEffect(() => {
      client.openComposer({ kind: "element", anchor: { key: "c1" }, label: "the Yield card" });
    }, [client]);
    return null;
  }

  it("rings what the composer is pointed at, and names it", async () => {
    const target = fixture("c1", { x: 160, y: 260, w: 240, h: 70 });
    const comments = [comment("c1")];

    await render(
      mounted([
        createElement(MapleMarkLayer, { key: "layer", comments, visible: comments }),
        createElement(Opener, { key: "opener" }),
      ]),
    );

    const node = await ring();
    expect(node.getAttribute("data-mk-state")).toBe("composing");
    expect(root().querySelector(".mk-ring-label")!.textContent).toBe("the Yield card");
    expect(node.style.getPropertyValue("--mk-y")).toBe(
      `${Math.round(target.getBoundingClientRect().y) - 3}px`,
    );
  });
});

/** Every part takes `asChild`, so an application keeps its own element. */
describe("asChild", () => {
  it("hands the mark's state to a caller's own button", async () => {
    await render(
      mounted(
        createElement(
          MapleMark,
          { address: 7, status: "resolved", asChild: true },
          createElement("button", { className: "mine", type: "button" }),
        ),
      ),
    );

    await vi.waitFor(() => expect(root().querySelector("button.mine")).not.toBeNull());
    const node = root().querySelector<HTMLElement>("button.mine")!;

    expect(node.className).toBe("mk-mark mk-hit mine");
    expect(node.getAttribute("data-form")).toBe("solid");
    expect(node.querySelector(".mk-leaf-body")).not.toBeNull();
  });
});

/** The same leaf, at avatar size. It never says the word "guest" at anybody. */
describe("the avatar", () => {
  async function avatar(props: { name: string; provenance?: "client" | "guest" | "server" }) {
    await render(mounted(createElement(MapleAvatar, { colorSlot: 3, ...props })));
    await vi.waitFor(() => expect(root().querySelector(".mk-avatar")).not.toBeNull());
    return root().querySelector<HTMLElement>(".mk-avatar")!;
  }

  it("fills the leaf for an author the session verified", async () => {
    const node = await avatar({ name: "Sam Okafor", provenance: "server" });

    expect(node.textContent).toBe("SO");
    expect(getComputedStyle(node.querySelector(".mk-leaf-body")!).fillOpacity).toBe("1");
    expect(node.getAttribute("title")).toBe(
      "Sam Okafor — verified by the application's own session",
    );
  });

  it("thins it for one the application only vouched for", async () => {
    const node = await avatar({ name: "Priya R", provenance: "client" });

    expect(getComputedStyle(node.querySelector(".mk-leaf-body")!).fillOpacity).toBe("0.4");
    expect(node.getAttribute("title")).toBe("Priya R — the application told us; unverified");
  });

  it("outlines it for someone who typed a name, and does not say so", async () => {
    const node = await avatar({ name: "Reviewer A", provenance: "guest" });

    expect(node.querySelector(".mk-leaf-edge")).not.toBeNull();
    expect(node.getAttribute("title")).toBe("Reviewer A — typed a name into Maple");
    expect(node.getAttribute("title")).not.toContain("guest");
  });

  it("takes the reviewer's own colour, set as a property rather than a rule", async () => {
    const node = await avatar({ name: "Jules" });
    expect(node.style.getPropertyValue("--mk-slot")).not.toBe("");
    expect(getComputedStyle(node.querySelector(".mk-leaf-body")!).fill).toBe(
      node.style.getPropertyValue("--mk-slot"),
    );
  });
});
