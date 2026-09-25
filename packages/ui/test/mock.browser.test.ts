import { decodeRecipe } from "@maple-kit/core/mock";
import { createInventory, createMockClient, installMock, seenFlags } from "@maple-kit/mock";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";

import { Maple } from "../src/maple.js";
import { MapleMock } from "../src/mock/index.js";
import { offlineFetch } from "./offline.js";

import type { MockPlan, MockPlanState } from "@maple-kit/core/connectors";
import type { IdentityRules, Recipe } from "@maple-kit/core/mock";
import type { MockClient, MockHandle, MockView, PlanLookup } from "@maple-kit/mock";

const LIST = "rest:GET /api/reviews";
const USER = "rest:GET /api/session";
const HERE = "/";

interface Page {
  readonly view: MockView;
  readonly assign: ReturnType<typeof vi.fn>;
  readonly writeText: ReturnType<typeof vi.fn>;
}

/** The real window, except that Apply is heard rather than followed. */
function fakePage(): Page {
  const assign = vi.fn();
  const writeText = vi.fn(() => Promise.resolve());
  const view: MockView = {
    document,
    matchMedia: (query) => window.matchMedia(query),
    getComputedStyle: (element) => window.getComputedStyle(element),
    location: {
      href: `${location.origin}${HERE}`,
      pathname: HERE,
      assign,
      protocol: location.protocol,
    },
    sessionStorage,
    navigator: { clipboard: { writeText } },
    addEventListener: (type, listener, options) => window.addEventListener(type, listener, options),
  };
  return { view, assign, writeText };
}

function handle(recipe?: Recipe): MockHandle {
  const inventory = createInventory();
  for (const key of [LIST, USER]) inventory.record(HERE, { key, status: 200, body: {}, at: 1 });
  return { recipe, inventory, dispose: () => undefined };
}

function roots(): ShadowRoot[] {
  return [...document.querySelectorAll<HTMLElement>("[data-maple-overlay]")].flatMap((host) =>
    host.shadowRoot ? [host.shadowRoot] : [],
  );
}

function find<T extends Element>(selector: string): T | null {
  for (const root of roots()) {
    const found = root.querySelector<T>(selector);
    if (found) return found;
  }
  return null;
}

function buttonNamed(name: string, within: ParentNode | null = find(".mk-mock")) {
  const found = [...(within?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (button) => button.textContent === name,
  );
  if (!found) throw new Error(`no button named ${name}`);
  return found;
}

const clients: MockClient[] = [];

/** A client the test owns, destroyed after it so no listener outlives it. */
function track(client: MockClient): MockClient {
  clients.push(client);
  return client;
}

beforeEach(async () => {
  sessionStorage.clear();
  localStorage.clear();
  await page.viewport(1100, 760);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

describe("MapleMock on a page with no <Maple />", () => {
  it("draws nothing where no transport is installed", async () => {
    await render(createElement(MapleMock, { defaultOpen: true }));
    await userEvent.keyboard("m");

    expect(document.querySelectorAll("[data-maple-overlay]")).toHaveLength(0);
  });

  it("mounts a shadow host of its own and lists the recorded calls", async () => {
    const client = track(
      createMockClient({ handle: handle(), view: fakePage().view, defaultOpen: true }),
    );
    await render(createElement(MapleMock, { client }));

    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());
    expect(roots()).toHaveLength(1);
    const names = [...(find(".mk-mock-calls")?.querySelectorAll(".mk-mock-name") ?? [])];
    expect(names.map((name) => name.textContent)).toEqual([
      "restGET /api/session",
      "restGET /api/reviews",
    ]);
  });

  it("adopts the box's rules and the tokens, and not the island's", async () => {
    const client = track(
      createMockClient({ handle: handle(), view: fakePage().view, defaultOpen: true }),
    );
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());

    const rules = roots()[0]!.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(rules.some((rule) => rule.startsWith(".mk-mock "))).toBe(true);
    expect(rules.some((rule) => rule.includes("--mk-accent"))).toBe(true);
    expect(rules.some((rule) => rule.startsWith(".mk-island"))).toBe(false);
  });
});

describe("nine states beside a call", () => {
  it.each([
    [1100, 1],
    [390, 2],
  ])("keeps every button inside its row at %i px, on %i lines", async (width, lines) => {
    await page.viewport(width, 760);
    const client = track(
      createMockClient({ handle: handle(), view: fakePage().view, defaultOpen: true }),
    );
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock-call")).not.toBeNull());

    const row = find(".mk-mock-call")!;
    const edge = row.getBoundingClientRect();
    const buttons = [...row.querySelectorAll(".mk-mock-state")].map((button) =>
      button.getBoundingClientRect(),
    );
    expect(buttons.map((button) => button.width)).toHaveLength(9);
    for (const button of buttons) {
      expect(button.left).toBeGreaterThanOrEqual(edge.left);
      expect(button.right).toBeLessThanOrEqual(edge.right);
    }
    expect(new Set(buttons.map((button) => Math.round(button.top))).size).toBe(lines);
    const name = row.querySelector(".mk-mock-name")!.getBoundingClientRect();
    expect(name.width).toBeGreaterThanOrEqual(160);
  });
});

/** The DoD's shortcut case: a key typed inside the shadow root is typing. */
describe("the m shortcut inside the shadow root", () => {
  async function mounted() {
    const client = track(createMockClient({ handle: handle(), view: fakePage().view }));
    client.start();
    await render(createElement(MapleMock, { client }));
    return client;
  }

  it("opens the box from the page, focused on its field", async () => {
    await mounted();
    await userEvent.keyboard("m");

    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());
    await vi.waitFor(() => expect(roots()[0]!.activeElement).toBe(find(".mk-mock-field")));
  });

  it("types an m into the box's own field rather than closing it", async () => {
    const client = await mounted();
    await userEvent.keyboard("m");
    await vi.waitFor(() => expect(roots()[0]?.activeElement).toBe(find(".mk-mock-field")));

    await userEvent.keyboard("mm");
    expect(find(".mk-mock")).not.toBeNull();
    expect(client.getState().query).toBe("mm");
  });

  it("closes on Escape, even from the field", async () => {
    await mounted();
    await userEvent.keyboard("m");
    await vi.waitFor(() => expect(roots()[0]?.activeElement).toBe(find(".mk-mock-field")));

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(find(".mk-mock")).toBeNull());
  });

  it("ignores m with a modifier", async () => {
    await mounted();
    await userEvent.keyboard("{Meta>}m{/Meta}");
    expect(find(".mk-mock")).toBeNull();
  });
});

describe("picking and applying", () => {
  it("applies a picked state by reloading into a link that carries it", async () => {
    const { assign, view } = fakePage();
    const client = track(createMockClient({ handle: handle(), view, defaultOpen: true }));
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());

    expect(buttonNamed("Apply and reload").disabled).toBe(true);
    const row = find<HTMLElement>(".mk-mock-call:last-child");
    buttonNamed("Empty", row).click();
    await vi.waitFor(() =>
      expect(buttonNamed("Empty", row).getAttribute("aria-checked")).toBe("true"),
    );
    buttonNamed("Apply and reload").click();

    const next = new URL(assign.mock.calls[0]?.[0] as string);
    expect(decodeRecipe(next.searchParams.get("maple-mock") ?? "")).toEqual({
      version: 2,
      calls: [{ key: LIST, state: "empty" }],
      route: HERE,
    });
  });

  it("copies a link and a recipe, with no store to post to", async () => {
    const { view, writeText } = fakePage();
    const client = track(createMockClient({ handle: handle(), view, defaultOpen: true }));
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());

    buttonNamed("Error", find(".mk-mock-call")).click();
    await vi.waitFor(() => expect(buttonNamed("Copy link").disabled).toBe(false));
    buttonNamed("Copy link").click();
    await vi.waitFor(() => expect(buttonNamed("Copied")).toBeDefined());
    buttonNamed("Copy recipe").click();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(String(writeText.mock.calls[0]?.[0])).toContain("maple-mock=");
    expect(JSON.parse(String(writeText.mock.calls[1]?.[0]))).toMatchObject({
      calls: [{ key: USER, state: "error" }],
    });
  });
});

describe("where each call's shape came from", () => {
  it("tags a row with its rung once the shape is known, and leaves the rest bare", async () => {
    const shaped: MockHandle = {
      ...handle(),
      shape: (key) =>
        key === LIST ? Promise.resolve({ schema: {}, source: "router" as const }) : undefined,
    };
    const client = track(
      createMockClient({ handle: shaped, view: fakePage().view, defaultOpen: true }),
    );
    client.start();
    await render(createElement(MapleMock, { client }));

    await vi.waitFor(() => expect(find(".mk-mock-rung")?.textContent).toBe("Router types"));
    expect(find(".mk-mock-rung")?.closest(".mk-mock-call")?.textContent).toContain("/api/reviews");
    expect(roots()[0]!.querySelectorAll(".mk-mock-rung")).toHaveLength(1);
  });
});

describe("the banner", () => {
  const active: Recipe = { version: 2, calls: [{ key: LIST, state: "empty" }], route: HERE };

  it("is on while a mock is, with Turn off and no dismiss", async () => {
    const { assign, view } = fakePage();
    const client = track(createMockClient({ handle: handle(active), view }));
    await render(createElement(MapleMock, { client }));

    await vi.waitFor(() => expect(find(".mk-mock-banner")).not.toBeNull());
    const banner = find<HTMLElement>(".mk-mock-banner")!;
    expect(banner.textContent).toContain("GET /api/reviews is empty");
    const labels = [...banner.querySelectorAll("button")].map((button) => button.textContent);
    expect(labels).toEqual(["Edit", "Turn off"]);

    buttonNamed("Turn off", banner).click();
    expect(new URL(assign.mock.calls[0]?.[0] as string).searchParams.has("maple-mock")).toBe(false);
  });

  it("opens the box from Edit, with the mock's calls already chosen", async () => {
    const client = track(createMockClient({ handle: handle(active), view: fakePage().view }));
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock-banner")).not.toBeNull());

    buttonNamed("Edit", find(".mk-mock-banner")).click();
    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());
    expect(find('.mk-mock-call[data-mk-mocked="true"]')?.textContent).toContain("/api/reviews");
  });
});

describe("Maple.Mock inside <Maple />", () => {
  let installed: MockHandle | undefined;

  afterEach(() => {
    installed?.dispose();
    installed = undefined;
  });

  function maple() {
    return createElement(Maple, {
      branch: "feat/mock",
      theme: "light",
      options: { fetch: offlineFetch() },
    });
  }

  it("is absent where mocking is off", async () => {
    await render(maple());
    await vi.waitFor(() => expect(roots()).toHaveLength(1));
    await userEvent.keyboard("m");

    expect(find(".mk-mock")).toBeNull();
  });

  it("shares the overlay's shadow root where a transport is installed", async () => {
    installed = installMock({ ignore: () => true });
    await render(maple());
    await vi.waitFor(() => expect(find(".mk-pill")).not.toBeNull());

    await userEvent.keyboard("m");
    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());
    expect(roots()).toHaveLength(1);
  });

  it("does not start a comment pick when c is typed into the box", async () => {
    installed = installMock({ ignore: () => true });
    await render(maple());
    await vi.waitFor(() => expect(find(".mk-pill")).not.toBeNull());
    await userEvent.keyboard("m");
    await vi.waitFor(() => expect(roots()[0]?.activeElement).toBe(find(".mk-mock-field")));

    await userEvent.keyboard("c");
    expect(find(".mk-shield")).toBeNull();
    expect(find<HTMLInputElement>(".mk-mock-field")?.value).toBe("c");
  });
});

/** A plan every call is concerned in, with the given shares. */
function planned(shares: Partial<Record<MockPlanState, number>>): MockPlan {
  const distribution = {
    empty: 0.02,
    error: 0.02,
    forbidden: 0.02,
    loading: 0.02,
    one: 0.02,
    many: 0.02,
    long: 0.02,
    sparse: 0.02,
    mixed: 0.02,
    none: 0.02,
    ...shares,
  };
  const state = (Object.keys(shares)[0] ?? "none") as MockPlanState;
  return {
    state,
    distribution,
    confidence: distribution[state],
    calls: [
      { key: LIST, concerned: true, p: 0.9 },
      { key: USER, concerned: false, p: 0.1 },
    ],
  };
}

describe("the box, reading a sentence", () => {
  async function typed(sentence: string, plan: MockPlan) {
    const fake = fakePage();
    const lookup = vi.fn<PlanLookup>(() => Promise.resolve(plan));
    const client = track(
      createMockClient({
        handle: { ...handle(), plan: lookup },
        view: fake.view,
        defaultOpen: true,
        planDebounceMs: 10,
      }),
    );
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock-field")).not.toBeNull());
    await userEvent.type(find<HTMLInputElement>(".mk-mock-field")!, sentence);
    return { client, fake, lookup };
  }

  it("offers a chip for a clear state, and Apply carries the sentence", async () => {
    const { fake } = await typed("no reviews yet", planned({ empty: 0.8 }));

    await vi.waitFor(() => expect(find(".mk-mock-chip")).not.toBeNull());
    buttonNamed("Empty · 1 call").click();
    await vi.waitFor(() => expect(buttonNamed("Apply and reload").disabled).toBe(false));
    buttonNamed("Apply and reload").click();

    const applied = new URL(String(fake.assign.mock.calls[0]?.[0]));
    expect(decodeRecipe(applied.searchParams.get("maple-mock") ?? "")).toEqual({
      version: 2,
      calls: [{ key: LIST, state: "empty" }],
      route: HERE,
      request: "no reviews yet",
    });
  });

  it("offers two chips when the sentence is torn between two states", async () => {
    await typed("no reviews or broken", planned({ empty: 0.45, error: 0.35 }));

    await vi.waitFor(() =>
      expect(find(".mk-mock-suggest")?.textContent).toBe("Empty · 1 callorError · 1 call"),
    );
  });

  it("says so when the sentence names no state, and offers nothing", async () => {
    await typed("make the header blue", planned({ none: 0.7 }));

    await vi.waitFor(() =>
      expect(find(".mk-mock-unnamed")?.textContent).toBe(
        "That doesn't name a state this page's data can be in.",
      ),
    );
    expect(find(".mk-mock-chip")).toBeNull();
  });

  it("shows nothing at all for a plan it is unsure of", async () => {
    const { lookup } = await typed("hmm reviews", planned({ empty: 0.3, error: 0.25 }));

    await vi.waitFor(() => expect(lookup).toHaveBeenCalled());
    await new Promise((settle) => setTimeout(settle, 50));
    expect(find(".mk-mock-chip")).toBeNull();
    expect(find(".mk-mock-unnamed")).toBeNull();
  });

  it("keeps every call listed while it reads a sentence rather than filtering", async () => {
    await typed("no reviews yet", planned({ empty: 0.8 }));

    expect(find(".mk-mock-calls")?.querySelectorAll(".mk-mock-call")).toHaveLength(2);
    expect(find<HTMLInputElement>(".mk-mock-field")?.placeholder).toBe(
      "Say a state, like “no items yet”",
    );
  });
});

describe("flags and who the page is told the reviewer is", () => {
  const RULES: IdentityRules = {
    call: USER,
    role: { path: "role", values: ["owner", "barista"] },
    permissions: { path: "grants", values: ["roasts.delete"] },
    requires: {},
  };

  function layered(recipe?: Recipe): MockHandle {
    return { ...handle(recipe), identity: () => Promise.resolve(RULES) };
  }

  it("loads no panel on a page with no rules and no flags", async () => {
    const client = track(
      createMockClient({ handle: handle(), view: fakePage().view, defaultOpen: true }),
    );
    client.start();
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());
    expect(find(".mk-mock-layers")).toBeNull();
  });

  it("offers the host's roles, permissions and the page's flags, and applies them", async () => {
    seenFlags().record({ key: "new-roaster", type: "boolean", value: false });
    const { assign, view } = fakePage();
    const client = track(createMockClient({ handle: layered(), view, defaultOpen: true }));
    client.start();
    await render(createElement(MapleMock, { client }));

    await vi.waitFor(() => expect(find('[role="radiogroup"][aria-label="Role"]')).not.toBeNull());
    const layers = find<HTMLElement>(".mk-mock-layers");
    buttonNamed("barista", layers).click();
    buttonNamed("Taken away", find('[aria-label="roasts.delete"]')).click();
    buttonNamed("On", find('[aria-label="new-roaster"]')).click();
    await vi.waitFor(() => expect(buttonNamed("Apply and reload").disabled).toBe(false));
    buttonNamed("Apply and reload").click();

    const next = new URL(assign.mock.calls[0]?.[0] as string);
    expect(decodeRecipe(next.searchParams.get("maple-mock") ?? "")).toEqual({
      version: 2,
      calls: [],
      flags: { "new-roaster": true },
      as: { role: "barista", permissions: { "roasts.delete": false } },
      route: HERE,
    });
  });

  it("says who the page is shown as, that the server still acts as you, and every write", async () => {
    const active: Recipe = { version: 2, calls: [], as: { role: "barista" }, route: HERE };
    const writes = { list: () => [LIST, LIST], subscribe: () => () => undefined };
    const client = track(
      createMockClient({ handle: { ...layered(active), writes }, view: fakePage().view }),
    );
    client.start();
    await render(createElement(MapleMock, { client }));

    await vi.waitFor(() =>
      expect(find(".mk-mock-banner")?.textContent).toContain(
        "Showing as barista. The server still acts as you. 2 writes reached the server as you.",
      ),
    );
  });
});

describe("the box, reading a sentence that names a role or a flag", () => {
  const RULES: IdentityRules = {
    call: USER,
    role: { path: "role", values: ["owner", "barista"] },
    requires: {},
  };

  it("offers a chip in the chunk's words, and Apply carries the role and the flag", async () => {
    const fake = fakePage();
    const plan: MockPlan = {
      ...planned({ none: 0.8 }),
      flags: [{ key: "new-roaster", value: false, concerned: true, p: 0.9 }],
      role: { role: "barista", p: 0.9 },
    };
    const client = track(
      createMockClient({
        handle: {
          ...handle(),
          identity: () => Promise.resolve(RULES),
          plan: () => Promise.resolve(plan),
        },
        view: fake.view,
        defaultOpen: true,
        planDebounceMs: 10,
      }),
    );
    client.start();
    await render(createElement(MapleMock, { client }));
    await vi.waitFor(() => expect(find(".mk-mock-layers")).not.toBeNull());
    await userEvent.type(find<HTMLInputElement>(".mk-mock-field")!, "as a barista, no new roaster");

    await vi.waitFor(() =>
      expect(find(".mk-mock-chip")?.textContent).toBe("new-roaster Off · as barista"),
    );
    buttonNamed("new-roaster Off · as barista").click();
    await vi.waitFor(() => expect(buttonNamed("Apply and reload").disabled).toBe(false));
    buttonNamed("Apply and reload").click();

    const applied = new URL(String(fake.assign.mock.calls[0]?.[0]));
    expect(decodeRecipe(applied.searchParams.get("maple-mock") ?? "")).toEqual({
      version: 2,
      calls: [],
      flags: { "new-roaster": false },
      as: { role: "barista" },
      route: HERE,
      request: "as a barista, no new roaster",
    });
  });
});
