import { createLogger, memorySink } from "@maple-kit/core/logger";
import {
  linkRecipeId,
  readRecipeCookie,
  RECIPE_COOKIE,
  RECIPE_ID_PARAM,
} from "@maple-kit/core/mock";
import { createMockClient, installMock, RECIPE_STORAGE_KEY } from "@maple-kit/mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { API, createApiFake, PROJECTS } from "./msw/api.js";
import { handlerFetch } from "./msw/fetch.js";
import { createRecipeReadsFake, RECIPES_BASE } from "./msw/recipe-reads.js";

import type { Recipe } from "@maple-kit/core/mock";
import type { MockHandle } from "@maple-kit/mock";

const api = createApiFake();
const recipes = createRecipeReadsFake();
const nativeFetch = globalThis.fetch;
const page = location.href;
const ID = "k3Zx9aQ1";
const shared: Recipe = {
  version: 2,
  calls: [{ key: "rest:GET /api/projects", state: "empty" }],
  flags: { "new-roaster": true },
};
let handle: MockHandle | undefined;

/** Opens this page from a short link, then installs the interceptor. */
function open(options: Parameters<typeof installMock>[0] = {}): MockHandle {
  history.replaceState(null, "", linkRecipeId(page, ID));
  handle = installMock({ route: RECIPES_BASE, ...options });
  return handle;
}

beforeEach(() => {
  globalThis.fetch = handlerFetch([...recipes.handlers, ...api.handlers]);
  sessionStorage.clear();
  recipes.store(ID, shared);
});

afterEach(() => {
  handle?.dispose();
  handle = undefined;
  globalThis.fetch = nativeFetch;
  history.replaceState(null, "", page);
  document.cookie = `${RECIPE_COOKIE}=; Max-Age=0; Path=/`;
  api.reset();
  recipes.reset();
});

describe("a page opened from a short link", () => {
  it("holds a matched request until the recipe arrives, then answers from it", async () => {
    const { link } = open();
    expect(link?.status()).toBe("loading");

    const projects = (await (await fetch(`${API}/projects`)).json()) as typeof PROJECTS;

    expect(projects.items).toEqual([]);
    expect(recipes.asked).toEqual([ID]);
    expect(link?.status()).toBe("loaded");
    expect(handle?.recipe).toEqual(shared);
  });

  it("keeps the recipe for the tab and the cookie, and takes the id out of the address bar", async () => {
    open();
    await handle?.link?.settled;

    expect(JSON.parse(sessionStorage.getItem(RECIPE_STORAGE_KEY) ?? "null")).toEqual(shared);
    expect(readRecipeCookie(document.cookie)?.flags).toEqual(shared.flags);
    expect(new URL(location.href).searchParams.has(RECIPE_ID_PARAM)).toBe(false);
  });

  it("does not hold or record the route's own requests", async () => {
    open();
    await fetch(`${location.origin}${RECIPES_BASE}/mock/recipes/${ID}`);
    await handle?.link?.settled;
    expect(recipes.asked).toEqual([ID, ID]);
  });

  it("passes requests through and says so when the route refuses", async () => {
    const sink = memorySink();
    recipes.refuseNext(404);
    open({ logger: createLogger({ sinks: [sink] }) });

    const projects = (await (await fetch(`${API}/projects`)).json()) as typeof PROJECTS;

    expect(projects.items).toEqual(PROJECTS.items);
    expect(api.reached).toEqual(["GET /api/projects"]);
    expect(handle?.link?.status()).toBe("failed");
    expect(handle?.recipe).toBeUndefined();
    expect(sessionStorage.getItem(RECIPE_STORAGE_KEY)).toBeNull();
    expect(new URL(location.href).searchParams.get(RECIPE_ID_PARAM)).toBe(ID);
    expect(JSON.stringify(sink.records)).not.toContain(ID);
  });

  it("gives up on a route that never answers, and passes requests through", async () => {
    recipes.stallNext();
    open();
    const settled = handle?.link?.settled;
    const projects = (await (await fetch(`${API}/projects`)).json()) as typeof PROJECTS;
    await settled;

    expect(projects.items).toEqual(PROJECTS.items);
    expect(handle?.link?.status()).toBe("failed");
  }, 10_000);

  it("fails at once when the page names no route to ask", async () => {
    history.replaceState(null, "", linkRecipeId(page, ID));
    handle = installMock();
    await handle?.link?.settled;
    expect(handle?.link?.status()).toBe("failed");
  });

  it("tells the box when the mock could not be loaded, and fills its draft when it can", async () => {
    recipes.refuseNext(500);
    open();
    const failed = createMockClient();
    failed.start();
    await handle?.link?.settled;
    expect(failed.getState().linkFailed).toBe(true);
    handle?.dispose();

    open();
    const loaded = createMockClient();
    expect(loaded.getState().linkFailed).toBe(false);
    loaded.start();
    await handle?.link?.settled;
    expect(loaded.getState().draft).toEqual(shared.calls);
  });
});
