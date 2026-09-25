import { createLogger, memorySink } from "@maple-kit/core/logger";
import { installMock, linkRecipe, pathPattern, RECIPE_STORAGE_KEY } from "@maple-kit/mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { API, createApiFake, ME, PROJECTS } from "./msw/api.js";
import { handlerFetch } from "./msw/fetch.js";

import type { MockState, Recipe } from "@maple-kit/core/mock";
import type { MockHandle } from "@maple-kit/mock";

const api = createApiFake();
const nativeFetch = globalThis.fetch;
const page = location.href;
let handle: MockHandle | undefined;

function recipe(...calls: [string, MockState][]): Recipe {
  return { version: 1, calls: calls.map(([key, state]) => ({ key, state })) };
}

/** Opens this page as a shared link would, then installs the interceptor. */
function install(active?: Recipe, options: Parameters<typeof installMock>[0] = {}): MockHandle {
  history.replaceState(null, "", linkRecipe(page, active));
  handle = installMock({ fetch: globalThis.fetch, ...options });
  return handle;
}

function xhr(method: string, url: string): Promise<XMLHttpRequest> {
  return new Promise((done, fail) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.addEventListener("loadend", () => done(request));
    request.addEventListener("error", () => fail(new Error("xhr failed")));
    request.send();
  });
}

beforeEach(() => {
  globalThis.fetch = handlerFetch(api.handlers);
  sessionStorage.clear();
});

afterEach(() => {
  handle?.dispose();
  handle = undefined;
  globalThis.fetch = nativeFetch;
  history.replaceState(null, "", page);
  api.reset();
});

describe("installMock, in a real browser", () => {
  it("answers fetch with the linked state and lets every other call through", async () => {
    install(recipe(["rest:GET /api/projects", "empty"]));

    const projects = (await (await fetch(`${API}/projects`)).json()) as typeof PROJECTS;
    const me: unknown = await (await fetch(`${API}/me`)).json();

    expect(projects.items).toEqual([]);
    expect(projects.total).toBe(0);
    expect(me).toEqual(ME);
    expect(api.reached).toEqual(["GET /api/projects", "GET /api/me"]);
  });

  it("answers XMLHttpRequest the same way", async () => {
    install(recipe(["rest:GET /api/projects", "one"], ["rest:GET /api/me", "forbidden"]));

    const projects = await xhr("GET", `${API}/projects`);
    const me = await xhr("GET", `${API}/me`);

    expect(JSON.parse(projects.responseText)).toMatchObject({ items: [PROJECTS.items[0]] });
    expect(me.status).toBe(403);
    expect(api.reached).toEqual(["GET /api/projects"]);
  });

  it("keeps a linked recipe for the tab", () => {
    const active = recipe(["rest:GET /api/projects", "empty"]);
    install(active);
    expect(JSON.parse(sessionStorage.getItem(RECIPE_STORAGE_KEY) ?? "null")).toEqual(active);
  });

  it("records what the page fetched, per route, and nothing it mocked", async () => {
    const { inventory } = install(recipe(["rest:GET /api/projects", "empty"]));
    await fetch(`${API}/me`);
    await fetch(`${API}/projects`);

    const keys = inventory.calls(pathPattern(location.pathname)).map((sample) => sample.key);
    expect(keys).toEqual(["rest:GET /api/projects", "rest:GET /api/me"]);
    expect(
      inventory.sample("rest:GET /api/projects", pathPattern(location.pathname))?.body,
    ).toEqual(PROJECTS);
  });

  it("drops a recipe it cannot read, says so, and mocks nothing", async () => {
    sessionStorage.setItem(RECIPE_STORAGE_KEY, "{");
    const sink = memorySink();
    install(undefined, { logger: createLogger({ sinks: [sink] }) });

    expect(handle?.recipe).toBeUndefined();
    expect(sessionStorage.getItem(RECIPE_STORAGE_KEY)).toBeNull();
    expect(sink.records.map((line) => line.message)).toEqual([
      "Ignoring a mock recipe that could not be read.",
    ]);
    expect(await (await fetch(`${API}/projects`)).json()).toEqual(PROJECTS);
  });

  it("neither mocks nor records a request it is told to ignore", async () => {
    const { inventory } = install(recipe(["rest:GET /api/projects", "error"]), {
      ignore: (url) => url.pathname === "/api/projects",
    });
    const response = await fetch(`${API}/projects`);
    expect(response.status).toBe(200);
    expect(inventory.calls(pathPattern(location.pathname))).toEqual([]);
  });

  it("lets the page cancel an endless stream it does not read", async () => {
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode(`data: ${String(pulled)}\n\n`));
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = { "content-type": "text/event-stream" };
    globalThis.fetch = () => Promise.resolve(new Response(endless, { headers }));
    install(recipe(["rest:GET /api/projects", "empty"]));

    const reader = (await fetch(`${API}/events`)).body?.getReader();
    for (let chunk = 0; chunk < 3; chunk++) await reader?.read();
    await reader?.cancel();

    // The page's cancel settles only once every copy of the stream is cancelled.
    expect(cancelled).toBe(true);
  });

  it("installs once, and restores fetch when disposed", () => {
    const stub = globalThis.fetch;
    const first = install();
    expect(installMock()).toBe(first);
    expect(globalThis.fetch).not.toBe(stub);
    first.dispose();
    handle = undefined;
    expect(globalThis.fetch).toBe(stub);
  });
});
