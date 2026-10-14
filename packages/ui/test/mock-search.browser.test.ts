import { createInventory, createMockClient, routeCalls, seenFlags } from "@maple-kit/mock";
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

    await userEvent.click(buttonNamed("Search all APIs")!);
    await userEvent.keyboard("rev");
    expect(find<HTMLInputElement>('input[aria-label="Search APIs"]')?.value).toBe("rev");
    expect(find("section[aria-label='Search all APIs']")).toBeNull();

    chunk.release();
    await vi.waitFor(() => expect(find("section[aria-label='Search all APIs']")).not.toBeNull());
    expect(find<HTMLInputElement>('input[aria-label="Search APIs"]')!.value).toBe("rev");
  });
});

describe("Search all flags", () => {
  // The page's flag registry is global to this file, so this runs before any flag is recorded.
  it("is not offered where no flag source reached the page", async () => {
    const { fetch } = route();
    await open(fetch);

    expect(buttonNamed("Search all APIs")).toBeDefined();
    expect(buttonNamed("Search all flags")).toBeUndefined();
  });

  it("finds a flag the page never read, from memory, and puts it in the draft", async () => {
    seenFlags().record({ key: "legacy-billing", type: "boolean", value: false });
    seenFlags().record({ key: "new-checkout", type: "boolean", value: true });
    const { asked, fetch } = route();
    const client = await open(fetch);

    await vi.waitFor(() => expect(buttonNamed("Search all flags")).toBeDefined());
    buttonNamed("Search all flags")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search flags"]')).not.toBeNull());
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

    buttonNamed("Search all APIs")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search APIs"]')).not.toBeNull());
    await vi.waitFor(() => expect(asked).toEqual(["?q="]));
    expect(document.activeElement?.shadowRoot?.activeElement?.getAttribute("aria-label")).toBe(
      "Search APIs",
    );
  });

  it("lists 20 at a time, adds a pick as a draft row, and keeps it when Escape closes the search", async () => {
    const { fetch } = route();
    const client = await open(fetch);
    buttonNamed("Search all APIs")!.click();
    const section = () => find("section[aria-label='Search all APIs']")!;
    await vi.waitFor(() => expect(section().querySelectorAll(".mk-mock-call")).toHaveLength(21));

    expect(section().textContent).toContain("List invoices");
    buttonNamed("Show more")!.click();
    await vi.waitFor(() => expect(section().querySelectorAll(".mk-mock-call")).toHaveLength(26));

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
    await vi.waitFor(() =>
      expect(find("[data-mk-search='calls']")!.matches(":focus, :focus-within")).toBe(true),
    );

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(find(".mk-mock")).toBeNull());
  });

  it("still closes on Escape once Show more has run out and its button is gone", async () => {
    const { fetch } = route();
    await open(fetch);
    buttonNamed("Search all APIs")!.click();
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
    buttonNamed("Search all APIs")!.click();
    await vi.waitFor(() => expect(find('input[aria-label="Search APIs"]')).not.toBeNull());

    await userEvent.type(
      find<HTMLInputElement>('input[aria-label="Search APIs"]')!,
      "a".repeat(230),
    );

    await vi.waitFor(() =>
      expect(find<HTMLInputElement>('input[aria-label="Search APIs"]')!.value).toHaveLength(200),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(find("section[aria-label='Search all APIs']")!.textContent).not.toContain("Couldn't");
    expect(asked.every((search) => search.length <= "?q=".length + 200)).toBe(true);
  });

  it("says so, once, when the route describes no calls, and still searches the page's own", async () => {
    const { fetch } = route([]);
    await open(fetch);
    buttonNamed("Search all APIs")!.click();

    await vi.waitFor(() =>
      expect(find(".mk-mock-unnamed")?.textContent).toContain("No API schemas"),
    );
    expect(find("section[aria-label='Search all APIs']")!.textContent).toContain("/api/reviews");
  });

  it("fits a 360 px screen", async () => {
    await page.viewport(360, 760);
    const { fetch } = route();
    await open(fetch);
    buttonNamed("Search all APIs")!.click();
    await vi.waitFor(() =>
      expect(find("section[aria-label='Search all APIs'] .mk-mock-call")).not.toBeNull(),
    );

    const body = find(".mk-mock-body")!;
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  });
});
