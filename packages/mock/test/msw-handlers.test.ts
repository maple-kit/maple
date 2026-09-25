import { createInventory } from "@maple-kit/mock";
import { mockHandlers } from "@maple-kit/mock/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { API, createApiFake, ME, PROJECTS } from "./msw/api.js";
import { handlerFetch } from "./msw/fetch.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { Recipe } from "@maple-kit/core/mock";

const api = createApiFake();
const inventory = createInventory();

const recipe: Recipe = {
  version: 2,
  calls: [
    { key: "rest:GET /api/projects", state: "empty" },
    { key: "rest:GET /api/count", state: "error" },
  ],
};

// A forward that reaches the host's handlers rather than a real network,
// which is where `bypass` would send it from a test.
const server = createTestServer(
  ...mockHandlers(recipe, { fetch: handlerFetch(api.handlers), inventory, route: () => "/p" }),
  ...api.handlers,
);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => api.reset());

describe("mockHandlers, under setupServer", () => {
  it("answers a named call in its state", async () => {
    const body = (await (await fetch(`${API}/projects`)).json()) as typeof PROJECTS;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("answers a named failure without reaching the host's handlers", async () => {
    expect((await fetch(`${API}/count`)).status).toBe(500);
    expect(api.reached).toEqual([]);
  });

  it("falls through to the host's own handlers for every other call", async () => {
    await expect((await fetch(`${API}/me`)).json()).resolves.toEqual(ME);
    expect(api.reached).toEqual(["GET /api/me"]);
  });

  it("records the real answer it reshaped", async () => {
    await fetch(`${API}/projects`);
    expect(inventory.sample("rest:GET /api/projects", "/p")?.body).toEqual(PROJECTS);
  });

  it("is the same export at /msw", async () => {
    const browser = await import("@maple-kit/mock/msw");
    expect(browser.mockHandlers).toBe(mockHandlers);
  });
});
