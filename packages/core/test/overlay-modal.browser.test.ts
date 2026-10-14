import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { createOverlayHost } from "../src/overlay/index.js";

import type { OverlayHost } from "../src/overlay/index.js";

let host: OverlayHost | undefined;

afterEach(() => {
  host?.destroy();
  host = undefined;
  for (const node of document.querySelectorAll("[data-test]")) node.remove();
});

/** An island-like control and a composer-like textarea, both opted in to events. */
function mount(): { island: HTMLElement; field: HTMLTextAreaElement } {
  host = createOverlayHost();
  host.addStyles(
    "button, textarea { position: fixed; top: 40px; left: 40px; width: 200px; height: 60px; pointer-events: auto }" +
      "textarea { top: 120px }",
  );
  const island = document.createElement("button");
  const field = document.createElement("textarea");
  host.root.append(island, field);
  return { island, field };
}

function hostDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.dataset["test"] = "";
  dialog.innerHTML = '<input aria-label="host field"><button>ok</button>';
  document.body.append(dialog);
  return dialog;
}

function hitAt(element: Element): Element | null {
  const box = element.getBoundingClientRect();
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
}

describe("the overlay under a native modal dialog", () => {
  it("moves into the open modal, so it can be hit and typed into", async () => {
    const { island, field } = mount();
    const dialog = hostDialog();
    dialog.showModal();

    await vi.waitFor(() => expect(host?.container.parentNode).toBe(dialog));
    expect(hitAt(island)).toBe(host?.container);

    field.focus();
    expect(host?.root.activeElement).toBe(field);
    await userEvent.keyboard("hello");
    expect(field.value).toBe("hello");
  });

  it("goes back to where it was mounted when the modal closes", async () => {
    mount();
    const dialog = hostDialog();
    dialog.showModal();
    await vi.waitFor(() => expect(host?.container.parentNode).toBe(dialog));

    dialog.close();
    await vi.waitFor(() => expect(host?.container.parentNode).toBe(document.documentElement));
  });

  it("goes back when the modal is removed with the overlay inside it", async () => {
    mount();
    const dialog = hostDialog();
    dialog.showModal();
    await vi.waitFor(() => expect(host?.container.parentNode).toBe(dialog));

    dialog.remove();
    await vi.waitFor(() => expect(host?.container.parentNode).toBe(document.documentElement));
  });

  it("follows the topmost of two modals", async () => {
    mount();
    const first = hostDialog();
    const second = hostDialog();
    first.showModal();
    second.showModal();

    await vi.waitFor(() => expect(host?.container.parentNode).toBe(second));
    second.close();
    await vi.waitFor(() => expect(host?.container.parentNode).toBe(first));
  });

  it("ignores a non-modal dialog", async () => {
    mount();
    const dialog = hostDialog();
    dialog.show();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(host?.container.parentNode).toBe(document.documentElement);
  });

  it("does not take its own modal popup for the page's", async () => {
    mount();
    const own = document.createElement("dialog");
    host?.root.append(own);
    own.showModal();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(host?.container.parentNode).toBe(document.documentElement);
    expect(own.matches(":modal")).toBe(true);
  });

  it("keeps its own modal popup modal when it is moved", async () => {
    mount();
    const own = document.createElement("dialog");
    host?.root.append(own);
    own.showModal();
    const dialog = hostDialog();
    dialog.showModal();

    await vi.waitFor(() => expect(host?.container.parentNode).toBe(dialog));
    expect(own.matches(":modal")).toBe(true);
  });

  it("stops following once destroyed", async () => {
    mount();
    host?.destroy();
    const dialog = hostDialog();
    dialog.showModal();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.querySelector("[data-maple-overlay]")).toBeNull();
  });
});

describe("the overlay under a scripted modal", () => {
  it("counts a click on the overlay as inside the modal", async () => {
    const { island } = mount();
    const modal = document.createElement("div");
    modal.dataset["test"] = "";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.textContent = "scripted";
    document.body.append(modal);

    let outside = 0;
    const onDown = (event: Event) => {
      if (!modal.contains(event.target as Node)) outside += 1;
    };
    document.addEventListener("pointerdown", onDown, true);

    await vi.waitFor(() => expect(host?.container.parentNode).toBe(modal));
    await userEvent.click(island);
    document.removeEventListener("pointerdown", onDown, true);

    expect(outside).toBe(0);
  });

  it("keeps the focus it had in its own shadow root across the move", async () => {
    const { field } = mount();
    field.focus();
    const modal = document.createElement("div");
    modal.dataset["test"] = "";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);

    await vi.waitFor(() => expect(host?.container.parentNode).toBe(modal));
    expect(host?.root.activeElement).toBe(field);
  });

  it("leaves a hidden scripted modal alone", async () => {
    mount();
    const modal = document.createElement("div");
    modal.dataset["test"] = "";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.style.display = "none";
    document.body.append(modal);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(host?.container.parentNode).toBe(document.documentElement);
  });
});
