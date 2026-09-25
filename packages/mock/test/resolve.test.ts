import { createInventory, MANY, resolve, restCodec } from "@maple-kit/mock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { API, createApiFake, ME, PROJECTS } from "./msw/api.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MockState, Recipe } from "@maple-kit/core/mock";
import type { Inventory } from "@maple-kit/mock";

const api = createApiFake();
const server = createTestServer(...api.handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => api.reset());

const options = {
  codecs: [restCodec],
  forward: (request: Request) => fetch(request),
  route: "/p",
  now: () => 5,
};

function recipe(key: string, state: MockState): Recipe {
  return { version: 1, calls: [{ key, state }] };
}

async function run(
  url: string,
  active?: Recipe,
  inventory: Inventory = createInventory(),
  init?: RequestInit,
) {
  return resolve(new Request(`${API}${url}`, init), active, inventory, options);
}

describe("resolve", () => {
  it("lets a request through when there is no recipe", async () => {
    await expect(run("/projects")).resolves.toBeUndefined();
    expect(api.reached).toEqual([]);
  });

  it.each([
    ["on its own route", "/p", 403],
    ["nowhere else", "/q", undefined],
  ])("applies a recipe that names a route %s", async (_, route, status) => {
    const active = { ...recipe("rest:GET /api/projects", "forbidden"), route: "/p" };
    const response = await resolve(new Request(`${API}/projects`), active, createInventory(), {
      ...options,
      route,
    });
    expect(response?.status).toBe(status);
  });

  it("lets through a call the recipe does not name", async () => {
    await expect(run("/me", recipe("rest:GET /api/projects", "empty"))).resolves.toBeUndefined();
    expect(api.reached).toEqual([]);
  });

  it("reshapes the server's own answer, keeping its headers", async () => {
    const response = await run("/me", recipe("rest:GET /api/me", "empty"));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-trace")).toBe("t1");
    await expect(response?.json()).resolves.toEqual(ME);
    expect(api.reached).toEqual(["GET /api/me"]);
  });

  it.each([
    ["empty", { ...PROJECTS, items: [], total: 0, nextCursor: null, hasMore: false }],
    [
      "one",
      { ...PROJECTS, items: [PROJECTS.items[0]], total: 1, nextCursor: null, hasMore: false },
    ],
  ] as const)("answers %s from the list", async (state, expected) => {
    const response = await run("/projects", recipe("rest:GET /api/projects", state));
    await expect(response?.json()).resolves.toEqual(expected);
  });

  it("answers many", async () => {
    const response = await run("/projects", recipe("rest:GET /api/projects", "many"));
    const body = (await response?.json()) as typeof PROJECTS;
    expect(body.items).toHaveLength(MANY);
  });

  it("matches a call by its pattern, not its id", async () => {
    const response = await run("/projects/99", recipe("rest:GET /api/projects/:id", "forbidden"));
    expect(response?.status).toBe(403);
  });

  it.each([
    ["error", 500],
    ["forbidden", 403],
  ] as const)("answers %s without asking the server", async (state, status) => {
    const response = await run("/projects", recipe("rest:GET /api/projects", state));
    expect(response?.status).toBe(status);
    expect(api.reached).toEqual([]);
  });

  it("never sends a mutation it answers with a failure", async () => {
    const response = await run("/projects", recipe("rest:POST /api/projects", "error"), undefined, {
      method: "POST",
      body: "{}",
    });
    expect(response?.status).toBe(500);
    expect(api.reached).toEqual([]);
  });

  it("holds a loading call until the request is abandoned", async () => {
    const controller = new AbortController();
    const pending = resolve(
      new Request(`${API}/projects`, { signal: controller.signal }),
      recipe("rest:GET /api/projects", "loading"),
      createInventory(),
      options,
    );
    const settled = await Promise.race([
      pending.then(() => "settled"),
      wait(30).then(() => "held"),
    ]);
    expect(settled).toBe("held");
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(api.reached).toEqual([]);
  });

  it("lets go of a loading call abandoned before it was held", async () => {
    const controller = new AbortController();
    const request = new Request(`${API}/projects`, { signal: controller.signal });
    controller.abort();
    const pending = resolve(
      request,
      recipe("rest:GET /api/projects", "loading"),
      createInventory(),
      options,
    );
    await expect(pending).rejects.toThrow();
    expect(api.reached).toEqual([]);
  });

  it("records the real answer, not the mocked one", async () => {
    const inventory = createInventory();
    await run("/projects", recipe("rest:GET /api/projects", "empty"), inventory);
    expect(inventory.sample("rest:GET /api/projects", "/p")).toEqual({
      key: "rest:GET /api/projects",
      status: 200,
      body: PROJECTS,
      at: 5,
    });
  });

  it("falls back to the recorded answer when the server fails", async () => {
    const inventory = createInventory();
    inventory.record("/p", { key: "rest:GET /api/projects", status: 200, body: PROJECTS, at: 1 });
    api.fail("/api/projects");
    const response = await run("/projects", recipe("rest:GET /api/projects", "one"), inventory);
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ items: [PROJECTS.items[0]], total: 1 });
  });

  it("passes the server's failure on when nothing was recorded", async () => {
    api.fail("/api/projects");
    const response = await run("/projects", recipe("rest:GET /api/projects", "empty"));
    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ message: "upstream timed out" });
  });

  it("returns a response it cannot read untouched", async () => {
    const response = await run("/page", recipe("rest:GET /api/page", "empty"));
    await expect(response?.text()).resolves.toBe("<p>hi</p>");
  });

  it("reshapes a bare count", async () => {
    const response = await run("/count", recipe("rest:GET /api/count", "empty"));
    await expect(response?.json()).resolves.toBe(0);
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
