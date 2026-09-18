import { afterEach, describe, expect, it } from "vitest";

import {
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

function pointer(type: string, x: number, y: number): void {
  document.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
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
    const drawn: { width: number }[] = [];

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

  it("ignores a pointerup that no pointerdown started", () => {
    mount(`<p>x</p>`);
    stop = new AbortController();
    const picked: Pick[] = [];

    startRegionPicking({ onPick: (pick) => picked.push(pick), signal: stop.signal });
    pointer("pointerup", 200, 200);

    expect(picked).toHaveLength(0);
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
