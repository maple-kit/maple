import {
  createInventory,
  createMockClient,
  pathPattern,
  routeCalls,
  seenFlags,
} from "@maple-kit/mock";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";

import { MapleMock } from "../src/mock/index.js";

import type { MockClient, MockHandle, MockView } from "@maple-kit/mock";

const chunk = vi.hoisted(() => {
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release: () => release() };
});

vi.mock("../src/mock/search.js", async (original) => {
  await chunk.held;
  return original();
});

const SEEN = "rest:GET /api/reviews";
const HERE = "/";

const DESCRIBED = [
  { key: "rest:GET /api/invoices", method: "GET", path: "/api/invoices", summary: "List invoices" },
  ...Array.from({ length: 24 }, (_, n) => ({
    key: `rest:GET /api/bulk/${String(n)}`,
    method: "GET",
    path: `/api/bulk/${String(n)}`,
  })),
];

/** A route that answers 20 calls a page, and remembers every address it was asked for. */
function route(calls: readonly unknown[] = DESCRIBED) {
  const asked: string[] = [];
  const answer = vi.fn((input: URL) => {
    const url = new URL(input);
    asked.push(url.search);
    if ((url.searchParams.get("q") ?? "").length > 200) {
      return Promise.resolve(Response.json({ error: "bad" }, { status: 400 }));
    }
    const found = calls.filter((call) =>
      JSON.stringify(call)
        .toLowerCase()
        .includes((url.searchParams.get("q") ?? "").toLowerCase()),
    );
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const next = start + 20 < found.length ? { next: String(start + 20) } : {};
    return Promise.resolve(Response.json({ calls: found.slice(start, start + 20), ...next }));
  });
  return { asked, fetch: answer as unknown as typeof fetch };
}

function view(): MockView {
  return {
    document,
    matchMedia: (query) => window.matchMedia(query),
    getComputedStyle: (element) => window.getComputedStyle(element),
    location: {
      href: `${location.origin}${HERE}`,
      pathname: HERE,
      assign: vi.fn(),
      protocol: location.protocol,
    },
    sessionStorage,
    addEventListener: (type, listener, options) => window.addEventListener(type, listener, options),
  };
}

function handle(fetcher: typeof fetch): MockHandle {
  const inventory = createInventory();
  inventory.record(HERE, { key: SEEN, status: 200, body: {}, at: 1 });
  inventory.record("/settings", { key: "rest:GET /api/team", status: 200, body: {}, at: 2 });
  const calls = routeCalls({ basePath: "/api/maple", fetch: fetcher });
  return { recipe: undefined, inventory, calls, dispose: () => undefined };
}

function find<T extends Element>(selector: string): T | null {
  for (const host of document.querySelectorAll<HTMLElement>("[data-maple-overlay]")) {
    const found = host.shadowRoot?.querySelector<T>(selector);
    if (found) return found;
  }
  return null;
}

/** The title row's "Search all" for one section. */
function searchButton(kind: "calls" | "flags"): HTMLButtonElement | null {
  return find<HTMLButtonElement>(`[data-mk-search="${kind}"]`);
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  const root = find(".mk-mock");
  return [...(root?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (button) => button.textContent === name,
  );
}

const clients: MockClient[] = [];

async function open(fetcher: typeof fetch): Promise<MockClient> {
  const client = createMockClient({ handle: handle(fetcher), view: view(), defaultOpen: true });
  clients.push(client);
  client.start();
  await render(createElement(MapleMock, { client }));
  await vi.waitFor(() => expect(find(".mk-mock")).not.toBeNull());
  return client;
}

beforeEach(async () => {
  sessionStorage.clear();
  await page.viewport(1100, 760);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

describe("the first search", () => {
  // Runs before anything else loads the search chunk, which is held until the test has typed.
  it("keeps every character typed straight after the click, while the search is still loading", async () => {
    const { fetch } = route();
    await open(fetch);

    await userEvent.click(searchButton("calls")!);
    await userEvent.keyboard("rev");
    expect(find<HTMLInputElement>('input[aria-label="Search all APIs"]')?.value).toBe("rev");
    expect(find("section[aria-label='Search all APIs']")).toBeNull();

    chunk.release();
    await vi.waitFor(() => expect(find("section[aria-label='Search all APIs']")).not.toBeNull());
    expect(find<HTMLInputElement>('input[aria-label="Search all APIs"]')!.value).toBe("rev");
  });
});

describe("Search all flags", () => {
  // The page's flag registry is global to this file, so this runs before any flag is recorded.
  it("is not offered where no flag source reached the page", async () => {
    const { fetch } = route();
    await open(fetch);

    expect(searchButton("calls")).not.toBeNull();
    expect(searchButton("flags")).toBeNull();
  });

  it("finds a flag the page never read, from memory, and puts it in the draft", async () => {
    seenFlags().record({ key: "legacy-billing", type: "boolean", value: false });
    seenFlags().record({ key: "new-checkout", type: "boolean", value: true });
    const { asked, fetch } = route();
    const client = await open(fetch);

    await vi.waitFor(() => expect(searchButton("flags")).not.toBeNull());
    searchButton("flags")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search all flags"]')).not.toBeNull());
    await userEvent.keyboard("BILLING");

    await vi.waitFor(() => {
      const names = [
        ...find("section[aria-label='Search all flags']")!.querySelectorAll(".mk-mock-name"),
      ];
      expect(names.map((name) => name.textContent)).toEqual(["legacy-billing"]);
    });
    const section = find("section[aria-label='Search all flags']")!;
    section.querySelector<HTMLButtonElement>('[role="radio"]:not([aria-checked="true"])')!.click();

    await vi.waitFor(() =>
      expect(client.getState().draftFlags).toEqual({ "legacy-billing": true }),
    );
    expect(section.textContent).toContain("added");
    expect(asked).toEqual([]);
  });
});

describe("Search all APIs", () => {
  it("asks the route nothing when the box opens, and reads when the button is clicked", async () => {
    const { asked, fetch } = route();
    await open(fetch);
    expect(asked).toEqual([]);

    searchButton("calls")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search all APIs"]')).not.toBeNull());
    await vi.waitFor(() => expect(asked).toEqual(["?q="]));
    expect(document.activeElement?.shadowRoot?.activeElement?.getAttribute("aria-label")).toBe(
      "Search all APIs",
    );
  });

  it("lists 20 at a time, adds a pick as a draft row, and keeps it when Escape closes the search", async () => {
    const { fetch } = route();
    const client = await open(fetch);
    searchButton("calls")!.click();
    const section = () => find("section[aria-label='Search all APIs']")!;
    await vi.waitFor(() => expect(section().querySelectorAll(".mk-mock-call")).toHaveLength(22));

    expect(section().textContent).toContain("List invoices");
    buttonNamed("Show more")!.click();
    await vi.waitFor(() => expect(section().querySelectorAll(".mk-mock-call")).toHaveLength(27));

    const invoices = [...section().querySelectorAll<HTMLElement>(".mk-mock-call")].find((row) =>
      row.textContent.includes("/api/invoices"),
    )!;
    invoices.querySelector<HTMLButtonElement>(".mk-mock-pick")!.click();
    [...invoices.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
      .find((item) => item.textContent === "Empty")!
      .click();
    await vi.waitFor(() => expect(invoices.textContent).toContain("added"));
    expect(client.getState().draft).toEqual([{ key: "rest:GET /api/invoices", state: "empty" }]);

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(find("section[aria-label='Search all APIs']")).toBeNull());
    expect(find(".mk-mock")).not.toBeNull();
    expect(client.getState().draft).toHaveLength(1);
    expect(find(".mk-mock-calls")!.textContent).toContain("/api/invoices");
    expect(find(".mk-mock-calls")!.textContent).toContain("added");
    await vi.waitFor(() =>
      expect(find("[data-mk-search='calls']")!.matches(":focus, :focus-within")).toBe(true),
    );

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(find(".mk-mock")).toBeNull());
  });

  it("still closes on Escape once Show more has run out and its button is gone", async () => {
    const { fetch } = route();
    await open(fetch);
    searchButton("calls")!.click();
    await vi.waitFor(() => expect(buttonNamed("Show more")).toBeDefined());

    await userEvent.click(buttonNamed("Show more")!);
    await vi.waitFor(() => expect(buttonNamed("Show more")).toBeUndefined());
    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(find("section[aria-label='Search all APIs']")).toBeNull());
    expect(find(".mk-mock")).not.toBeNull();
  });

  it("does not search past what the route accepts, however long the query", async () => {
    const { asked, fetch } = route();
    await open(fetch);
    searchButton("calls")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search all APIs"]')).not.toBeNull());

    await userEvent.type(
      find<HTMLInputElement>('input[aria-label="Search all APIs"]')!,
      "a".repeat(230),
    );

    await vi.waitFor(() =>
      expect(find<HTMLInputElement>('input[aria-label="Search all APIs"]')!.value).toHaveLength(
        200,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(find("section[aria-label='Search all APIs']")!.textContent).not.toContain("Couldn't");
    expect(asked.every((search) => search.length <= "?q=".length + 200)).toBe(true);
  });

  it("says so, once, when the route describes no calls, and still searches the page's own", async () => {
    const { fetch } = route([]);
    await open(fetch);
    searchButton("calls")!.click();

    await vi.waitFor(() =>
      expect(find(".mk-mock-unnamed")?.textContent).toContain("No API schemas"),
    );
    expect(find("section[aria-label='Search all APIs']")!.textContent).toContain("/api/reviews");
  });

  it("puts Search all in the title row, and swaps title and button for a field and Cancel", async () => {
    const { fetch } = route();
    await open(fetch);
    const title = () => find("p.mk-mock-route")?.textContent;

    expect(title()).toContain("Calls on");
    expect(searchButton("calls")!.textContent).toBe("Search all");
    expect(searchButton("calls")!.closest(".mk-mock-titlerow")).not.toBeNull();
    expect(find("p.mk-mock-route")?.nextElementSibling?.textContent).toBe("Search all");

    searchButton("calls")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search all APIs"]')).not.toBeNull());
    expect(title()).toBeUndefined();
    expect(searchButton("calls")).toBeNull();
    expect(buttonNamed("Cancel")).toBeDefined();
  });

  it("says where a result comes from, and Cancel brings back the title, the list and what was added", async () => {
    const { fetch } = route();
    const client = await open(fetch);
    searchButton("calls")!.click();
    const section = () => find("section[aria-label='Search all APIs']")!;
    await vi.waitFor(() => expect(section().querySelectorAll(".mk-mock-call")).toHaveLength(22));

    const rows = [...section().querySelectorAll<HTMLElement>(".mk-mock-call")];
    const invoices = rows.find((row) => row.textContent.includes("/api/invoices"))!;
    expect(invoices.textContent).toContain("OpenAPI");
    expect(rows.find((row) => row.textContent.includes("/api/team"))!.textContent).toContain(
      "another route",
    );
    expect(rows.find((row) => row.textContent.includes("/api/reviews"))!.textContent).not.toMatch(
      /OpenAPI|another route/,
    );

    invoices.querySelector<HTMLButtonElement>(".mk-mock-pick")!.click();
    [...invoices.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
      .find((item) => item.textContent === "Loading")!
      .click();
    await vi.waitFor(() => expect(invoices.textContent).toContain("added"));
    expect(invoices.textContent).not.toContain("OpenAPI");

    buttonNamed("Cancel")!.click();
    await vi.waitFor(() => expect(find("section[aria-label='Search all APIs']")).toBeNull());
    expect(find("p.mk-mock-route")?.textContent).toContain("Calls on");
    expect(find(".mk-mock-calls")!.textContent).toContain("/api/reviews");
    expect(find(".mk-mock-calls")!.textContent).toContain("/api/invoices");
    expect(find(".mk-mock-calls")!.textContent).toContain("added");
    expect(client.getState().draft).toHaveLength(1);
    expect(find(".mk-mock")).not.toBeNull();
    await vi.waitFor(() =>
      expect(searchButton("calls")!.matches(":focus, :focus-within")).toBe(true),
    );
  });

  it("fits a 360 px screen", async () => {
    await page.viewport(360, 760);
    const { fetch } = route();
    await open(fetch);
    searchButton("calls")!.click();
    await vi.waitFor(() =>
      expect(find("section[aria-label='Search all APIs'] .mk-mock-call")).not.toBeNull(),
    );

    const body = find(".mk-mock-body")!;
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  });
});

describe("Search all flags, from the Flags title row", () => {
  it("opens over a folded list, shows every known flag, and Cancel folds it back with the pick marked added", async () => {
    seenFlags().record({ key: "legacy-billing", type: "boolean", value: false });
    seenFlags().record({ key: "tier-pricing", type: "boolean", value: true });
    seenFlags().recordUsed({
      key: "merge-forecast",
      route: pathPattern(HERE),
      type: "boolean",
      value: true,
    });
    const { fetch } = route();
    const client = await open(fetch);
    await vi.waitFor(() => expect(searchButton("flags")).not.toBeNull());
    expect(searchButton("flags")!.closest(".mk-mock-titlerow")?.textContent).toContain("Flags");

    searchButton("flags")!.click();
    const section = () => find("section[aria-label='Search all flags']")!;
    await vi.waitFor(() => expect(section().textContent).toContain("tier-pricing"));
    expect(section().textContent).toContain("not read here");

    const row = [...section().querySelectorAll<HTMLElement>(".mk-mock-call")].find((item) =>
      item.textContent.includes("tier-pricing"),
    )!;
    row.querySelector<HTMLButtonElement>('[role="radio"]:not([aria-checked="true"])')!.click();
    await vi.waitFor(() => expect(row.textContent).toContain("added"));

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(find("section[aria-label='Search all flags']")).toBeNull());
    expect(find(".mk-mock")).not.toBeNull();
    const list = find("section[aria-label='Flags · 2']") ?? find("section[aria-label='Flags']")!;
    expect(list.textContent).toContain("tier-pricing");
    expect(list.textContent).toContain("added");
    expect(list.textContent).not.toContain("legacy-billing");
    expect(client.getState().draftFlags).toEqual({ "tier-pricing": false });
    await vi.waitFor(() =>
      expect(searchButton("flags")!.matches(":focus, :focus-within")).toBe(true),
    );
  });
});
