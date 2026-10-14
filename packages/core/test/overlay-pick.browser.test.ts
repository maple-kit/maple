import { afterEach, describe, expect, it } from "vitest";

import {
  containerFor,
  createOverlayHost,
  elementAt,
  MINIMUM_REGION,
  selectedText,
  startElementPicking,
  startRegionPicking,
} from "../src/overlay/index.js";

import type { OverlayHost, Pick } from "../src/overlay/index.js";

let page: HTMLElement | undefined;
let host: OverlayHost | undefined;
let stop: AbortController | undefined;

function mount(html: string): HTMLElement {
  page = document.createElement("div");
  page.setAttribute("style", "position: fixed; inset: 0; background: white; font: 16px sans-serif");
  page.innerHTML = html;
  document.body.append(page);
  return page;
}

function pointer(type: string, x: number, y: number, buttons = 1): void {
  document.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, buttons, bubbles: true, cancelable: true }),
  );
}

afterEach(() => {
  page?.remove();
  host?.destroy();
  stop?.abort();
  page = host = stop = undefined;
  document.getSelection()?.removeAllRanges();
});

describe("finding what is under the pointer", () => {
  it("finds the element there", () => {
    const root = mount(
      `<button style="position:absolute;left:0;top:0;width:100px;height:40px">Go</button>`,
    );
    expect(elementAt(50, 20)).toBe(root.querySelector("button"));
  });

  it("looks past Maple's own overlay to the page beneath", () => {
    const root = mount(
      `<button style="position:absolute;left:0;top:0;width:100px;height:40px">Go</button>`,
    );
    host = createOverlayHost();
    const blocker = document.createElement("div");
    blocker.setAttribute("style", "position:fixed;inset:0;pointer-events:auto");
    host.root.append(blocker);

    expect(elementAt(50, 20)).toBe(root.querySelector("button"));
  });

  it("finds nothing outside the document", () => {
    mount(`<p>x</p>`);
    expect(elementAt(-10, -10)).toBeUndefined();
  });
});

describe("picking an element", () => {
  it("reports what was clicked, with its rectangle", () => {
    const root = mount(
      `<button style="position:absolute;left:10px;top:20px;width:100px;height:40px">Go</button>`,
    );
    stop = new AbortController();
    const picked: Pick[] = [];

    startElementPicking({ onPick: (pick) => picked.push(pick), signal: stop.signal });
    pointer("click", 50, 30);

    expect(picked[0]?.kind).toBe("element");
    expect(picked[0]?.kind === "element" && picked[0].element).toBe(root.querySelector("button"));
    expect(picked[0]?.rect).toMatchObject({ x: 10, y: 20, width: 100, height: 40 });
  });

  it("stops the page seeing the click, so picking does not submit a form", () => {
    const root = mount(
      `<button style="position:absolute;left:0;top:0;width:100px;height:40px">Go</button>`,
    );
    stop = new AbortController();
    let pageSawIt = false;
    root.querySelector("button")!.addEventListener("click", () => (pageSawIt = true));

    startElementPicking({ onPick: () => undefined, signal: stop.signal });
    pointer("click", 50, 20);

    expect(pageSawIt).toBe(false);
  });

  it("reports what is hovered, so a highlight can follow the pointer", () => {
    mount(`<button style="position:absolute;left:0;top:0;width:100px;height:40px">Go</button>`);
    stop = new AbortController();
    const hovered: (Pick | undefined)[] = [];

    startElementPicking({
      onHover: (pick) => hovered.push(pick),
      onPick: () => undefined,
      signal: stop.signal,
    });
    pointer("pointermove", 50, 20);

    expect(hovered[0]?.kind).toBe("element");
  });

  it("stops listening when the caller aborts", () => {
    mount(`<button style="position:absolute;left:0;top:0;width:100px;height:40px">Go</button>`);
    const controller = new AbortController();
    const picked: Pick[] = [];

    startElementPicking({ onPick: (pick) => picked.push(pick), signal: controller.signal });
    controller.abort();
    pointer("click", 50, 20);

    expect(picked).toHaveLength(0);
  });
});

/**
 * A region crosses several elements on purpose, so what it is measured
 * against is the box that holds all of them rather than one of them.
 */
describe("the box a rectangle was drawn inside", () => {
  it("walks up past an element the rectangle overflows", () => {
    mount(
      `<section id="row" style="position: fixed; left: 0; top: 0; width: 400px; height: 200px">` +
        `<div id="card" style="position: absolute; left: 10px; top: 10px; width: 80px; height: 80px"></div>` +
        `</section>`,
    );

    expect(containerFor({ x: 20, y: 20, width: 40, height: 40 }).id).toBe("card");
    expect(containerFor({ x: 20, y: 20, width: 200, height: 40 }).id).toBe("row");
  });

  it("falls back to the document element rather than to nothing", () => {
    mount(`<p>x</p>`);
    const past = { x: -50, y: -50, width: innerWidth + 200, height: innerHeight + 200 };

    expect(containerFor(past)).toBe(document.documentElement);
  });
});

describe("dragging a rectangle", () => {
  it("reports the rectangle, whichever way it was dragged", () => {
    mount(`<p>x</p>`);
    stop = new AbortController();
    const picked: Pick[] = [];

    startRegionPicking({ onPick: (pick) => picked.push(pick), signal: stop.signal });
    pointer("pointerdown", 120, 90);
    pointer("pointerup", 20, 10);

    expect(picked[0]).toMatchObject({
      kind: "region",
      rect: { x: 20, y: 10, width: 100, height: 80 },
    });
  });

  it("reports the rectangle as it is drawn", () => {
    mount(`<p>x</p>`);
    stop = new AbortController();
    const drawn: ({ width: number } | undefined)[] = [];

    startRegionPicking({
      onDraw: (rect) => drawn.push(rect),
      onPick: () => undefined,
      signal: stop.signal,
    });
    pointer("pointerdown", 10, 10);
    pointer("pointermove", 60, 40);

    expect(drawn[0]).toMatchObject({ width: 50, height: 30 });
  });

  it("drops a drag too small to be anything but a missed click", () => {
    mount(`<p>x</p>`);
    stop = new AbortController();
    const picked: Pick[] = [];

    startRegionPicking({ onPick: (pick) => picked.push(pick), signal: stop.signal });
    pointer("pointerdown", 10, 10);
    pointer("pointerup", 10 + MINIMUM_REGION - 1, 10 + MINIMUM_REGION - 1);

    expect(picked).toHaveLength(0);
  });

  /**
   * The rectangle is the comment, not whatever sits under its middle. The
   * element it carries is the box its fractions are measured against.
   */
  it("carries the smallest element that holds the whole rectangle", () => {
    mount(
      `<section id="row" style="position: fixed; left: 0; top: 0; width: 400px; height: 200px">` +
        `<div id="a" style="position: absolute; left: 10px; top: 10px; width: 80px; height: 80px"></div>` +
        `<div id="b" style="position: absolute; left: 200px; top: 10px; width: 80px; height: 80px"></div>` +
        `</section>`,
    );
    stop = new AbortController();
    const picked: Pick[] = [];

    startRegionPicking({ onPick: (pick) => picked.push(pick), signal: stop.signal });
    pointer("pointerdown", 20, 20);
    pointer("pointerup", 270, 80);

    expect(picked[0]?.kind === "region" && picked[0].element.id).toBe("row");
  });

  it.each([
    ["pointercancel", () => document.dispatchEvent(new PointerEvent("pointercancel"))],
    ["lostpointercapture", () => document.dispatchEvent(new PointerEvent("lostpointercapture"))],
    ["a move with no button down", () => pointer("pointermove", 90, 90, 0)],
  ])("abandons the band on %s, so no phantom follows the next move", (_name, interrupt) => {
    mount(`<p>x</p>`);
    stop = new AbortController();
    const drawn: ({ width: number } | undefined)[] = [];

    startRegionPicking({
      onDraw: (rect) => drawn.push(rect),
      onPick: () => undefined,
      signal: stop.signal,
    });
    pointer("pointerdown", 10, 10);
    pointer("pointermove", 60, 40);
    interrupt();
    pointer("pointermove", 90, 90);

    expect(drawn).toHaveLength(2);
    expect(drawn[1]).toBeUndefined();
  });

  it("ignores a pointerup that no pointerdown started", () => {
    mount(`<p>x</p>`);
    stop = new AbortController();
    const picked: Pick[] = [];

    startRegionPicking({ onPick: (pick) => picked.push(pick), signal: stop.signal });
    pointer("pointerup", 200, 200);

    expect(picked).toHaveLength(0);
  });
});

describe("scrolling a pane while picking", () => {
  const pane =
    `<div id="pane" style="position:absolute;left:0;top:0;width:200px;height:100px;overflow:auto">` +
    `<div style="height:1000px"></div></div>`;

  function wheel(deltaY: number, deltaMode = 0): WheelEvent {
    const event = new WheelEvent("wheel", {
      clientX: 50,
      clientY: 50,
      deltaY,
      deltaMode,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    return event;
  }

  it("scrolls the pane under the pointer by the wheel delta", () => {
    const root = mount(pane);
    stop = new AbortController();
    startElementPicking({ onPick: () => undefined, signal: stop.signal });

    const event = wheel(40);

    expect(root.querySelector("#pane")!.scrollTop).toBe(40);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reads a line delta as lines, and a page delta as the pane's height", () => {
    const root = mount(pane);
    stop = new AbortController();
    startRegionPicking({ onPick: () => undefined, signal: stop.signal });

    wheel(2, 1);
    expect(root.querySelector("#pane")!.scrollTop).toBe(32);
    wheel(1, 2);
    expect(root.querySelector("#pane")!.scrollTop).toBe(32 + 100);
  });

  it("leaves the wheel to the page when nothing under it can scroll that way", () => {
    const root = mount(pane);
    stop = new AbortController();
    startElementPicking({ onPick: () => undefined, signal: stop.signal });

    const event = wheel(-40);

    expect(root.querySelector("#pane")!.scrollTop).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("selecting text", () => {
  it("reports the passage and where it is on screen", () => {
    const root = mount(`<p>The board approved the plan</p>`);
    const text = root.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 10);
    range.setEnd(text, 27);
    document.getSelection()!.addRange(range);

    const pick = selectedText();
    expect(pick?.kind).toBe("text");
    expect(pick?.kind === "text" && pick.range.toString()).toBe("approved the plan");
    expect(pick?.rect.width).toBeGreaterThan(0);
  });

  it("reports nothing when nothing is selected", () => {
    mount(`<p>x</p>`);
    expect(selectedText()).toBeUndefined();
  });

  it("ignores a selection inside the overlay's own UI", () => {
    mount(`<p>x</p>`);
    host = createOverlayHost();
    const own = document.createElement("p");
    own.textContent = "Maple's own text";
    host.container.append(own);

    const range = document.createRange();
    range.selectNodeContents(own);
    document.getSelection()!.addRange(range);

    expect(selectedText()).toBeUndefined();
  });
});
