import { decodeRecipe, RECIPE_PARAM } from "@maple-kit/core/mock";
import { describe, expect, it, vi } from "vitest";

import {
  createInventory,
  createMockClient,
  MockClipboardError,
  RECIPE_STORAGE_KEY,
} from "../src/index.js";

import type { MockHandle, MockView } from "../src/index.js";
import type { Recipe } from "@maple-kit/core/mock";

const PAGE = "https://preview.example.com/projects/42?tab=open";
const LIST = "rest:GET /api/projects";
const USER = "rest:GET /api/session";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

interface Page {
  readonly view: MockView;
  readonly storage: Storage;
  readonly assign: ReturnType<typeof vi.fn>;
  readonly writeText: ReturnType<typeof vi.fn>;
}

/** The parts of `window` the client reads before `start()`, which is a browser test. */
function page(href = PAGE, clipboard = true): Page {
  const storage = memoryStorage();
  const url = new URL(href);
  const assign = vi.fn();
  const writeText = vi.fn(() => Promise.resolve());
  const view = {
    location: { href: url.href, pathname: url.pathname, assign },
    sessionStorage: storage,
    navigator: clipboard ? { clipboard: { writeText } } : {},
  } as unknown as MockView;
  return { view, storage, assign, writeText };
}

function handle(recipe?: Recipe): MockHandle {
  const inventory = createInventory();
  for (const key of [LIST, USER]) {
    inventory.record("/projects/:id", { key, status: 200, body: {}, at: 1 });
  }
  return { recipe, inventory, dispose: () => undefined };
}

const recipe = (route?: string): Recipe => ({
  version: 1,
  calls: [{ key: LIST, state: "empty" }],
  ...(route === undefined ? {} : { route }),
});

describe("what the box shows", () => {
  it("draws nothing without an installed transport", () => {
    const client = createMockClient({ view: page().view });
    expect(client.getState()).toMatchObject({ installed: false, calls: [], active: undefined });
  });

  it("lists the route's recorded calls, most recent first, with nothing chosen", () => {
    const client = createMockClient({ view: page().view, handle: handle() });
    expect(client.getState()).toMatchObject({
      installed: true,
      route: "/projects/:id",
      calls: [
        { key: USER, seen: true },
        { key: LIST, seen: true },
      ],
      draft: [],
      changed: false,
    });
  });

  it.each([
    ["no route", undefined, true],
    ["this route", "/projects/:id", true],
    ["another route", "/settings", false],
  ])("starts from the recipe in force when it names %s", (_name, route, applies) => {
    const client = createMockClient({ view: page().view, handle: handle(recipe(route)) });
    const state = client.getState();

    expect(state.active !== undefined).toBe(applies);
    expect(state.draft).toEqual(applies ? recipe().calls : []);
    expect(state.calls.find((call) => call.key === LIST)?.state).toBe(
      applies ? "empty" : undefined,
    );
  });

  it("lists a call the draft names that this route never recorded", () => {
    const mocked: Recipe = { version: 1, calls: [{ key: "trpc:user.me", state: "error" }] };
    const client = createMockClient({ view: page().view, handle: handle(mocked) });
    expect(client.getState().calls.at(-1)).toEqual({
      key: "trpc:user.me",
      state: "error",
      seen: false,
    });
  });

  it.each([
    ["", [USER, LIST]],
    ["session", [USER]],
    ["GET projects", [LIST]],
    ["PROJECTS", [LIST]],
    ["nothing", []],
  ])("filters by %j, every word matching", (query, keys) => {
    const client = createMockClient({ view: page().view, handle: handle() });
    client.setQuery(query);
    expect(client.getState().calls.map((call) => call.key)).toEqual(keys);
  });
});

describe("choosing states", () => {
  it("puts a call in a state, moves it, and takes it out", () => {
    const client = createMockClient({ view: page().view, handle: handle() });
    const seen: boolean[] = [];
    client.subscribe((state) => seen.push(state.changed));

    client.choose(LIST, "empty");
    client.choose(USER, "error");
    client.choose(LIST, "many");
    expect(client.getState().draft).toEqual([
      { key: LIST, state: "many" },
      { key: USER, state: "error" },
    ]);

    client.choose(LIST, undefined);
    client.clear();
    expect(client.getState().draft).toEqual([]);
    expect(seen).toEqual([true, true, true, true, false]);
  });

  it("is unchanged when the draft is put back to what is in force", () => {
    const client = createMockClient({ view: page().view, handle: handle(recipe()) });
    client.choose(LIST, "one");
    expect(client.getState().changed).toBe(true);
    client.choose(LIST, "empty");
    expect(client.getState().changed).toBe(false);
  });

  it("scopes the recipe to the page's route", () => {
    const client = createMockClient({ view: page().view, handle: handle() });
    expect(client.recipe()).toBeUndefined();
    client.choose(LIST, "empty");
    expect(client.recipe()).toEqual(recipe("/projects/:id"));
  });
});

describe("applying", () => {
  it("keeps the recipe for the tab and reloads with it in the link", () => {
    const { assign, storage, view } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    client.apply();

    expect(JSON.parse(storage.getItem(RECIPE_STORAGE_KEY) ?? "null")).toEqual(
      recipe("/projects/:id"),
    );
    const next = new URL(assign.mock.calls[0]?.[0] as string);
    expect(next.pathname).toBe("/projects/42");
    expect(next.searchParams.get("tab")).toBe("open");
    expect(decodeRecipe(next.searchParams.get(RECIPE_PARAM) ?? "")).toEqual(
      recipe("/projects/:id"),
    );
  });

  it("turns mocking off when the draft is emptied and applied", () => {
    const linked = `${PAGE}&${RECIPE_PARAM}=abc`;
    const { assign, storage, view } = page(linked);
    storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(recipe()));
    const client = createMockClient({ view, handle: handle(recipe()) });
    client.clear();
    client.apply();

    expect(storage.getItem(RECIPE_STORAGE_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith(PAGE);
  });

  it("still reloads into the link where the tab's storage is blocked", () => {
    const { assign, view } = page();
    Object.defineProperty(view, "sessionStorage", {
      get: () => {
        throw new Error("blocked");
      },
    });
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "error");
    client.apply();
    expect(new URL(assign.mock.calls[0]?.[0] as string).searchParams.has(RECIPE_PARAM)).toBe(true);
  });
});

describe("copying, for a page with no store", () => {
  it("copies a link that opens the page in the draft", async () => {
    const { view, writeText } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    await client.copyLink();

    const copied = new URL(writeText.mock.calls[0]?.[0] as string);
    expect(decodeRecipe(copied.searchParams.get(RECIPE_PARAM) ?? "")).toEqual(
      recipe("/projects/:id"),
    );
  });

  it("copies the recipe as JSON", async () => {
    const { view, writeText } = page();
    const client = createMockClient({ view, handle: handle() });
    client.choose(LIST, "empty");
    await client.copyRecipe();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual(recipe("/projects/:id"));
  });

  it.each([
    ["an empty draft", true, false],
    ["a page with no clipboard", false, true],
  ])("refuses %s", async (_name, clipboard, chosen) => {
    const client = createMockClient({ view: page(PAGE, clipboard).view, handle: handle() });
    if (chosen) client.choose(LIST, "empty");
    await expect(client.copyLink()).rejects.toBeInstanceOf(MockClipboardError);
    await expect(client.copyRecipe()).rejects.toBeInstanceOf(MockClipboardError);
  });
});
