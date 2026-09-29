import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offlineFetch } from "./offline.js";

const STATE = "data-maple-review";
let runs = 0;

function overlays(): number {
  return document.querySelectorAll("[data-maple-overlay]").length;
}

/** Runs the script as a page would, fresh each time, and waits out its settling delay. */
async function runScript(): Promise<string | null> {
  runs += 1;
  await import(/* @vite-ignore */ `../src/standalone.ts?run=${String(runs)}`);
  await vi.waitFor(() => expect(document.documentElement.getAttribute(STATE)).not.toBeNull(), {
    timeout: 3000,
  });
  return document.documentElement.getAttribute(STATE);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", offlineFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(STATE);
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

describe("the standalone overlay script", () => {
  it("mounts one overlay on a page that has none", async () => {
    expect(await runScript()).toBe("mounted");
    await vi.waitFor(() => expect(overlays()).toBe(1));
  });

  it("stands down, adding no second overlay, when the page already mounts Maple", async () => {
    const existing = document.createElement("div");
    existing.setAttribute("data-maple-overlay", "");
    document.body.append(existing);

    expect(await runScript()).toBe("stood-down");
    expect(overlays()).toBe(1);
  });
});
