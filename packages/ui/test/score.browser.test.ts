import { createMapleClient } from "@maple-kit/core/client";
import { DEFAULT_PILLARS } from "@maple-kit/core/connectors";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleContextBadge } from "../src/composer/badge.js";
import { MapleBody } from "../src/composer/body.js";
import { MapleComposer } from "../src/composer/composer.js";
import { MapleScoreCard } from "../src/composer/score.js";
import { MapleRoot } from "../src/index.js";
import { createMapleFake, fetchThrough, MAPLE_BASE } from "./msw/composer.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ComposerTarget } from "@maple-kit/core/client";

const BRANCH = "feat/ui-score";
const WIDE: readonly [number, number] = [1100, 760];
const WRITTEN = "The Save button's label is cut off at 320px in the settings header.";

const TARGET: ComposerTarget = {
  kind: "element",
  anchor: { component: "SaveButton" },
  label: "the Save button",
  context: {
    url: "https://preview.example.com/settings",
    viewportWidth: 1440,
    viewportHeight: 900,
    contentWidth: 1020,
    devicePixelRatio: 2,
    colorScheme: "light",
    locale: "en-GB",
  },
};

let client: MapleClient;

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(...WIDE);
});

afterEach(async () => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  await page.viewport(...WIDE);
});

/** A client whose route judges a comment, unless `judges` says otherwise. */
function started(judges = true): MapleClient {
  const fake = createMapleFake({
    user: { id: "u_7", name: "Reviewer" },
    ...(judges ? { pillars: DEFAULT_PILLARS } : {}),
  });

  client = createMapleClient({
    branch: BRANCH,
    basePath: MAPLE_BASE,
    fetch: fetchThrough(fake.handlers),
    debounceMs: 0,
  });
  client.start();
  return client;
}

function mount(): void {
  void render(
    createElement(
      MapleRoot,
      { branch: BRANCH, client },
      createElement(
        MapleComposer,
        {},
        createElement(MapleBody, { key: "b" }),
        createElement(MapleScoreCard, { key: "s" }),
        createElement(MapleContextBadge, { key: "c" }),
      ),
    ),
  );
}

/** The overlay lives in a shadow root; nothing outside it can be queried. */
function shadow(): ShadowRoot {
  const host = document.querySelector("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("The overlay never mounted.");
  return host.shadowRoot;
}

function card(): HTMLElement | null {
  return shadow().querySelector(".mk-score");
}

async function type(body: string): Promise<void> {
  client.setBody(body);
  await expect.poll(() => card()?.dataset["mkStatus"]).toBe("ready");
}

describe("the score card", () => {
  it("draws nothing at all before anything is typed", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();

    await expect.poll(() => shadow().querySelector(".mk-ctx")).not.toBeNull();
    expect(card()).toBeNull();
  });

  it("lays its rows out before it has any scores to put in them", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();

    client.setBody(WRITTEN);
    await expect.poll(() => card()?.dataset["mkStatus"]).toBe("judging");
    expect(card()?.querySelectorAll(".mk-score-bar")).toHaveLength(DEFAULT_PILLARS.length);
  });

  it("does not move what is under it when the scores land", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();

    client.setBody(WRITTEN);
    await expect.poll(() => card()?.dataset["mkStatus"]).toBe("judging");
    const judging = card()?.getBoundingClientRect().height ?? 0;

    await expect.poll(() => card()?.dataset["mkStatus"]).toBe("ready");
    expect(card()?.getBoundingClientRect().height).toBeCloseTo(judging, 0);
  });

  it("keeps the rungs the same width, so which one it is stays readable", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    const bar = card()?.querySelector(".mk-score-bar");
    const widths = [...(bar?.querySelectorAll("i") ?? [])].map(
      (one) => one.getBoundingClientRect().width,
    );

    expect(widths).toHaveLength(3);
    expect(widths[0]).toBeCloseTo(widths.at(-1) ?? 0, 1);
  });

  it("fills each rung by the probability it took, and only that one", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    // The fill transitions, so it is polled: reading it once races the first
    // frame, which is the judging colour on every rung and passes the wrong way.
    const fills = () =>
      [...(card()?.querySelector(".mk-score-bar")?.querySelectorAll("i") ?? [])].map(
        (one) => getComputedStyle(one).backgroundColor,
      );

    await expect.poll(() => fills().at(-1) !== fills()[0]).toBe(true);
    expect(fills()[0]).toBe(fills()[1]);
  });

  it("says its level and how sure it is, to a reader who cannot see the bar", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    const label = card()?.querySelector(".mk-score-bar")?.getAttribute("aria-label");
    expect(label).toContain("specific");
    expect(label).toContain("% confident");
  });

  it("is not there at all when the deployment judges nothing", async () => {
    started(false);
    await client.load();
    client.openComposer(TARGET);
    mount();

    client.setBody(WRITTEN);
    await expect.poll(() => shadow().querySelector(".mk-ctx")).not.toBeNull();
    expect(card()).toBeNull();
  });
});

describe("the kind chip", () => {
  it("names the runner-up too when it is nearly as likely", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    client.setKind(undefined);
    expect(shadow().querySelector(".mk-kind-word")?.textContent).not.toContain(" or ");
  });

  it("shows what the classifier guessed", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    expect(shadow().querySelector(".mk-kind-word")?.textContent).toBe("bug");
  });

  it("lets a reviewer overrule it, and says the choice is theirs", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    client.setKind("copy");
    await expect.poll(() => shadow().querySelector(".mk-kind-word")?.textContent).toBe("copy");
    expect(shadow().querySelector(".mk-kind")?.getAttribute("data-mk-chosen")).toBe("true");
  });

  it("hands the kind back to the classifier when the reviewer clears it", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    await type(WRITTEN);

    client.setKind("praise");
    await expect.poll(() => shadow().querySelector(".mk-kind-word")?.textContent).toBe("praise");
    client.setKind(undefined);
    await expect.poll(() => shadow().querySelector(".mk-kind-word")?.textContent).toBe("bug");
  });
});

describe("the context card beside it", () => {
  it("is open before anything is typed, and folds on the first keystroke", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();

    const badge = () => shadow().querySelector(".mk-ctx-card");
    await expect.poll(() => badge()?.getAttribute("data-mk-open")).toBe("true");

    client.setBody("T");
    await expect.poll(() => badge()?.getAttribute("data-mk-open")).toBe("false");
  });

  it("keeps its title, in the labels' own muted uppercase, while it is folded", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    client.setBody("T");

    const summary = () => shadow().querySelector(".mk-ctx-sum");
    await expect.poll(() => summary()?.textContent).toBe("Page context");
    expect(shadow().querySelector(".mk-ctx")?.checkVisibility()).toBe(false);

    const title = getComputedStyle(summary()!);
    shadow().querySelector(".mk-ctx-card")?.setAttribute("data-mk-open", "true");
    const label = getComputedStyle(shadow().querySelector(".mk-ctx dt")!);
    for (const property of ["color", "fontSize", "fontWeight", "textTransform", "letterSpacing"]) {
      expect(title.getPropertyValue(property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))).toBe(
        label.getPropertyValue(property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)),
      );
    }
  });

  it("lines each label up with its value on one baseline", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();

    await expect.poll(() => shadow().querySelector(".mk-ctx dt")).not.toBeNull();
    expect(getComputedStyle(shadow().querySelector(".mk-ctx")!).alignItems).toBe("baseline");
    const label = shadow().querySelector(".mk-ctx dt")!;
    const value = shadow().querySelector(".mk-ctx dd")!;
    const baseline = (node: Element): number => {
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      node.prepend(probe);
      const bottom = probe.getBoundingClientRect().bottom;
      probe.remove();
      return bottom;
    };
    expect(Math.abs(baseline(label) - baseline(value))).toBeLessThan(0.5);
  });

  it("reopens only when the reviewer asks, and stays open while they type", async () => {
    started();
    await client.load();
    client.openComposer(TARGET);
    mount();
    client.setBody("T");

    const badge = () => shadow().querySelector(".mk-ctx-card");
    await expect.poll(() => badge()?.getAttribute("data-mk-open")).toBe("false");

    client.setContextOpen(true);
    await expect.poll(() => badge()?.getAttribute("data-mk-open")).toBe("true");
    expect(shadow().querySelector(".mk-ctx")?.checkVisibility()).toBe(true);
  });
});
