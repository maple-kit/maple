import { afterEach, describe, expect, it } from "vitest";

import { opensMock } from "../src/client/index.js";

afterEach(() => {
  for (const node of document.querySelectorAll("[data-test]")) node.remove();
});

/** Dispatches `m` at `from` and says whether a document listener would open the box. */
function typeAt(from: Element): boolean {
  let opens = false;
  const listener = (event: KeyboardEvent): void => {
    opens = opensMock(event);
  };
  document.addEventListener("keydown", listener, { once: true });
  from.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, composed: true }));
  document.removeEventListener("keydown", listener);
  return opens;
}

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.dataset["test"] = "";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function shadowHost(): ShadowRoot {
  return mount("<div id='h'></div>").querySelector("#h")!.attachShadow({ mode: "open" });
}

describe("opensMock in a real DOM", () => {
  it("opens from plain text", () => {
    expect(typeAt(mount("<p>text</p>").firstElementChild!)).toBe(true);
  });

  it("does not open from a descendant of a contenteditable", () => {
    const root = mount('<div contenteditable="true"><p><b id="x">hi</b></p></div>');
    expect(typeAt(root.querySelector("#x")!)).toBe(false);
  });

  it("opens from inside contenteditable=false", () => {
    const root = mount('<div contenteditable="false"><b id="x">hi</b></div>');
    expect(typeAt(root.querySelector("#x")!)).toBe(true);
  });

  it.each(["textbox", "combobox", "searchbox"])("does not open from role=%s", (role) => {
    const root = mount(`<div role="${role}"><span id="x">hi</span></div>`);
    expect(typeAt(root.querySelector("#x")!)).toBe(false);
  });

  it("does not open from an input inside an open shadow root", () => {
    const input = document.createElement("input");
    shadowHost().append(input);
    expect(typeAt(input)).toBe(false);
  });

  it("does not open from a contenteditable inside an open shadow root", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const leaf = document.createElement("span");
    editor.append(leaf);
    shadowHost().append(editor);
    expect(typeAt(leaf)).toBe(false);
  });

  it("opens from plain text inside an open shadow root", () => {
    const span = document.createElement("span");
    shadowHost().append(span);
    expect(typeAt(span)).toBe(true);
  });
});
