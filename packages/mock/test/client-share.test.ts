import { decodeRecipe, RECIPE_ID_PARAM, RECIPE_PARAM } from "@maple-kit/core/mock";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventory, createMockClient, routeRecipes } from "../src/index.js";
import { createRecipesFake, STORED_ID } from "./msw/recipes.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MockHandle, MockView } from "../src/index.js";

const fake = createRecipesFake();
const server = createTestServer(...fake.handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => fake.reset());

const PAGE = "https://preview.example.com/orders?tab=open";
const LIST = "trpc:orders.list";

function page() {
  const assign = vi.fn();
  const writeText = vi.fn((_text: string) => Promise.resolve());
  const url = new URL(PAGE);
  const view = {
    location: { href: url.href, pathname: url.pathname, assign, protocol: url.protocol },
    sessionStorage: { setItem: vi.fn(), getItem: () => null, removeItem: vi.fn() },
    navigator: { clipboard: { writeText } },
    document: { cookie: "" },
  } as unknown as MockView;
  return { view, assign, writeText };
}

function handle(): MockHandle {
  const inventory = createInventory();
  inventory.record("/orders", { key: LIST, status: 200, body: {}, at: 1 });
  const share = routeRecipes({
    basePath: "/api/maple",
    fetch: (input, init) => fetch(input, init),
    origin: "https://preview.example.com",
  });
  return { recipe: undefined, inventory, share, dispose: () => undefined };
}

/** Enough distinct calls that the inline link passes 2,000 characters. */
function crowd(client: ReturnType<typeof createMockClient>): void {
  for (let n = 0; n < 60; n += 1) client.choose(`trpc:orders.report${String(n)}`, "empty");
}

describe("copying and applying, for a page whose route stores recipes", () => {
  it("copies a link with the stored id and no inline recipe", async () => {
    const { view, writeText } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    await client.copyLink();

    const copied = new URL(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied.searchParams.get(RECIPE_ID_PARAM)).toBe(STORED_ID);
    expect(copied.searchParams.has(RECIPE_PARAM)).toBe(false);
    expect(copied.searchParams.get("tab")).toBe("open");
    expect(client.getState().longLink).toBe(false);
  });

  it("stores the recipe without the sentence behind it", async () => {
    const { view } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    await client.copyLink();
    expect(fake.stored).toEqual([
      { version: 2, calls: [{ key: LIST, state: "empty" }], route: "/orders" },
    ]);
  });

  it("applies by reloading into the short link", async () => {
    const { assign, view } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    client.apply();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledOnce());

    const next = new URL(assign.mock.calls[0]?.[0] as string);
    expect(next.searchParams.get(RECIPE_ID_PARAM)).toBe(STORED_ID);
    expect(next.searchParams.has(RECIPE_PARAM)).toBe(false);
  });

  it.each([
    ["has no store", () => fake.answerNext(404)],
    ["refuses", () => fake.answerNext(429)],
    ["fails", () => fake.answerNext(500)],
    ["cannot be reached", () => fake.failNext()],
  ])("falls back to the inline link when the route %s", async (_name, arrange) => {
    arrange();
    const { view, writeText } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    await client.copyLink();

    const copied = new URL(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied.searchParams.has(RECIPE_ID_PARAM)).toBe(false);
    expect(decodeRecipe(copied.searchParams.get(RECIPE_PARAM) ?? "")).toMatchObject({
      calls: [{ key: LIST, state: "empty" }],
    });
    expect(client.getState().longLink).toBe(false);
  });

  it("warns once the inline fallback passes 2,000 characters, and not again after an edit", async () => {
    fake.answerNext(404);
    const { view, writeText } = page();
    const client = createMockClient({ view, handle: handle() });
    crowd(client);
    await client.copyLink();

    expect((writeText.mock.calls[0]?.[0] ?? "").length).toBeGreaterThan(2000);
    expect(client.getState().longLink).toBe(true);
    client.choose(LIST, "error");
    expect(client.getState().longLink).toBe(false);
  });

  it("does not warn about a long recipe the route stored", async () => {
    const { view, writeText } = page();
    const client = createMockClient({ view, handle: handle() });
    crowd(client);
    await client.copyLink();
    expect((writeText.mock.calls[0]?.[0] ?? "").length).toBeLessThan(200);
    expect(client.getState().longLink).toBe(false);
  });
});
