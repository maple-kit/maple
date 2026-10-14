import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  CallsFailedError,
  createInventory,
  createMockClient,
  routeCalls,
  seenFlags,
} from "../src/index.js";
import { CALLS_URL, createCallsFake } from "./msw/calls.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MockHandle, MockView } from "../src/index.js";

const fake = createCallsFake();
const server = createTestServer(...fake.handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => fake.reset());

const ROUTE = "/orders";
const SEEN = "rest:GET /api/orders/:id";

function view(): MockView {
  const url = new URL(`https://preview.example.com${ROUTE}`);
  return {
    location: { href: url.href, pathname: url.pathname, assign: vi.fn(), protocol: url.protocol },
    document: { cookie: "" },
  } as unknown as MockView;
}

function handle(options: { calls?: boolean } = {}): MockHandle {
  const inventory = createInventory();
  inventory.record(ROUTE, { key: SEEN, status: 200, body: { id: 1 }, at: 1 });
  inventory.record("/other", { key: "rest:GET /api/other", status: 200, body: [], at: 2 });
  const calls =
    options.calls === false
      ? {}
      : {
          calls: routeCalls({
            basePath: "/api/maple",
            fetch,
            origin: "https://preview.example.com",
          }),
        };
  return { recipe: undefined, inventory, ...calls, dispose: () => undefined };
}

describe("Inventory.all", () => {
  it("lists every route's calls, the newest first, each key once", () => {
    const inventory = createInventory();
    inventory.record("/a", { key: "rest:GET /x", status: 200, body: 1, at: 1 });
    inventory.record("/a", { key: "rest:GET /y", status: 200, body: 2, at: 2 });
    inventory.record("/b", { key: "rest:GET /x", status: 200, body: 3, at: 3 });
    inventory.record("/b", { key: "rest:GET /z", status: 200, body: 4, at: 4 });

    expect(inventory.all().map(({ key, body }) => [key, body])).toEqual([
      ["rest:GET /z", 4],
      ["rest:GET /x", 3],
      ["rest:GET /y", 2],
    ]);
  });
});

describe("searching all APIs", () => {
  it("asks the route for nothing until a search is made", () => {
    const client = createMockClient({ view: view(), handle: handle(), defaultOpen: true });
    client.setSearch("calls");

    expect(client.getState().search).toBe("calls");
    expect(fake.asked).toEqual([]);
  });

  it("lists the tab's calls first, then the documents', 20 a page, with a cursor", async () => {
    const client = createMockClient({ view: view(), handle: handle() });
    const first = await client.searchCalls("");

    expect(first.hits.slice(0, 2).map((hit) => [hit.key, hit.seen])).toEqual([
      ["rest:GET /api/other", true],
      [SEEN, true],
    ]);
    expect(first.hits).toHaveLength(2 + 19);
    expect(first.hits.find((hit) => hit.key === "rest:GET /api/invoices")).toEqual({
      key: "rest:GET /api/invoices",
      summary: "List invoices",
      seen: false,
    });
    // The recorded call is not listed twice: the document's `{id}` is its `:id`.
    expect(first.hits.filter((hit) => hit.key === SEEN)).toHaveLength(1);
    expect(first.next).toBe("s20");

    const second = await client.searchCalls("", first.next);
    expect(second.hits).toHaveLength(10);
    expect(second.next).toBeUndefined();
    expect(fake.asked.map(({ cursor }) => cursor)).toEqual([null, "20"]);
  });

  it("matches the query in the tab's keys and in the documents' summaries", async () => {
    const client = createMockClient({ view: view(), handle: handle() });
    const found = await client.searchCalls("invoice");

    expect(found.hits.map((hit) => hit.key)).toEqual(["rest:GET /api/invoices"]);
    expect((await client.searchCalls("other")).hits.map((hit) => hit.key)).toEqual([
      "rest:GET /api/other",
    ]);
  });

  it("searches the tab's calls alone, and says so, when the route describes none", async () => {
    const none = createMockClient({ view: view(), handle: handle({ calls: false }) });
    expect((await none.searchCalls("")).schemas).toBe(false);
    expect(fake.asked).toEqual([]);

    const empty = createCallsFake([]);
    server.use(...empty.handlers);
    const answer = await createMockClient({ view: view(), handle: handle() }).searchCalls("");
    expect(answer.schemas).toBe(false);
    expect(answer.hits).toHaveLength(2);
  });

  it("reads a 404 as no calls, and any other failure as an error", async () => {
    const client = createMockClient({ view: view(), handle: handle() });
    fake.failNext(404);
    expect((await client.searchCalls("")).schemas).toBe(false);

    fake.failNext(500);
    await expect(client.searchCalls("")).rejects.toBeInstanceOf(CallsFailedError);
    expect(CALLS_URL).toContain("/mock/calls");
  });
});

describe("the box shutting", () => {
  it("closes an open search with it", () => {
    const client = createMockClient({ view: view(), handle: handle(), defaultOpen: true });
    client.setSearch("flags");
    expect(client.getState().search).toBe("flags");

    client.setOpen(false);
    expect(client.getState().search).toBeUndefined();
    client.setOpen(true);
    expect(client.getState().search).toBeUndefined();
  });
});

describe("searching all flags", () => {
  it("matches a substring of the key, case aside, from memory", () => {
    seenFlags().record({ key: "legacy-billing", type: "boolean", value: false });
    seenFlags().record({ key: "New-Checkout", type: "boolean", value: true });
    const client = createMockClient({ view: view(), handle: handle() });

    expect(client.searchFlags("BILL").map((flag) => flag.key)).toEqual(["legacy-billing"]);
    expect(client.getState().canSearchFlags).toBe(true);
    expect(fake.asked).toEqual([]);
  });

  it("shows what the draft sets, and a picked flag joins the list with its variants", () => {
    seenFlags().record({
      key: "tier-search",
      type: "string",
      value: "gold",
      variants: ["gold", "free"],
    });
    const client = createMockClient({ view: view(), handle: handle() });
    client.setFlag("tier-search", "free");

    expect(client.searchFlags("tier-search")[0]).toMatchObject({ key: "tier-search", set: "free" });
    const row = client.getState().flags.find((flag) => flag.key === "tier-search");
    expect(row).toMatchObject({ set: "free", variants: ["gold", "free"] });
  });
});
