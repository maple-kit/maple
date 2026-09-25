import {
  decodeRecipe,
  encodeRecipe,
  InvalidRecipeError,
  linkRecipe,
  RECIPE_PARAM,
} from "@maple-kit/core/mock";
import { forgetRecipe, readRecipe, RECIPE_STORAGE_KEY, saveRecipe } from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

import { keepRecipeCookie } from "../src/link.js";

import type { Recipe } from "@maple-kit/core/mock";

const empty: Recipe = { version: 2, calls: [{ key: "trpc:project.list", state: "empty" }] };
const error: Recipe = { version: 2, calls: [{ key: "rest:GET /api/me", state: "error" }] };

/** A `Storage` over a map, so a node test needs no DOM. */
function memoryStorage(entries: Record<string, string> = {}): Storage & Map<string, string> {
  const map = new Map(Object.entries(entries));
  return Object.assign(map, {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  }) as unknown as Storage & Map<string, string>;
}

describe("encodeRecipe and decodeRecipe", () => {
  it.each([
    ["a plain recipe", empty],
    ["a request with non-ASCII text", { ...empty, request: "état vide — 空の状態" }],
    ["no calls", { version: 2, calls: [] }],
  ] as const)("round-trips %s", (_, recipe) => {
    expect(decodeRecipe(encodeRecipe(recipe))).toEqual(recipe);
  });

  it("writes only URL-safe characters", () => {
    const recipe = { ...empty, request: "?".repeat(40) + "~".repeat(40) };
    expect(encodeRecipe(recipe)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("refuses to encode something that is not a recipe", () => {
    expect(() => encodeRecipe({ version: 2, calls: "all" } as unknown as Recipe)).toThrow(
      InvalidRecipeError,
    );
  });

  it.each([
    ["text that is not base64", "not base64!"],
    ["base64 that is not JSON", btoa("{")],
    ["bytes that are not UTF-8", btoa("ÿþ")],
    ["JSON that is not a recipe", btoa('{"version":1}')],
  ])("refuses %s", (_, text) => {
    expect(() => decodeRecipe(text)).toThrow(InvalidRecipeError);
  });
});

describe("readRecipe", () => {
  const page = "https://preview.example/projects";

  it("finds nothing on a plain page", () => {
    expect(readRecipe({ url: page, storage: memoryStorage() })).toBeUndefined();
  });

  it("reads the link", () => {
    expect(readRecipe({ url: linkRecipe(page, empty) })).toEqual(empty);
  });

  it("reads the tab", () => {
    const storage = memoryStorage({ [RECIPE_STORAGE_KEY]: JSON.stringify(empty) });
    expect(readRecipe({ url: page, storage })).toEqual(empty);
  });

  it("prefers the link to the tab", () => {
    const storage = memoryStorage({ [RECIPE_STORAGE_KEY]: JSON.stringify(error) });
    expect(readRecipe({ url: linkRecipe(page, empty), storage })).toEqual(empty);
  });

  it("throws on a recipe it cannot read, so the caller decides what to drop", () => {
    const storage = memoryStorage({ [RECIPE_STORAGE_KEY]: "{" });
    expect(() => readRecipe({ url: page, storage })).toThrow(InvalidRecipeError);
    expect(() => readRecipe({ url: `${page}?${RECIPE_PARAM}=x` })).toThrow(InvalidRecipeError);
  });
});

describe("saveRecipe and forgetRecipe", () => {
  it("keeps a recipe for the tab and forgets it", () => {
    const storage = memoryStorage();
    saveRecipe(storage, empty);
    expect(readRecipe({ url: "https://preview.example/", storage })).toEqual(empty);
    forgetRecipe(storage);
    expect(storage.has(RECIPE_STORAGE_KEY)).toBe(false);
  });
});

describe("linkRecipe", () => {
  it("sets the parameter and keeps the rest of the query", () => {
    const url = linkRecipe("https://preview.example/projects?tab=2", empty);
    expect(url.searchParams.get("tab")).toBe("2");
    expect(url.searchParams.get(RECIPE_PARAM)).toBe(encodeRecipe(empty));
  });

  it("removes the parameter", () => {
    const linked = linkRecipe("https://preview.example/projects?tab=2", empty);
    expect(linkRecipe(linked, undefined).href).toBe("https://preview.example/projects?tab=2");
  });
});

describe("keepRecipeCookie", () => {
  const layered: Recipe = { ...empty, flags: { "new-roaster": true } };
  const view = (protocol = "https:") => ({ document: { cookie: "" }, location: { protocol } });

  it("keeps the server's layers, secure over HTTPS", () => {
    const page = view();
    expect(keepRecipeCookie(page, layered)).toBe(true);
    expect(page.document.cookie).toMatch(/^maple-mock=[\w-]+; Path=\/; SameSite=Lax; Secure$/);
  });

  it("clears the cookie for no recipe, and over plain HTTP leaves out Secure", () => {
    const page = view("http:");
    expect(keepRecipeCookie(page, undefined)).toBe(true);
    expect(page.document.cookie).toBe("maple-mock=; Max-Age=0; Path=/; SameSite=Lax");
  });

  it("clears the cookie and says so when the layers do not fit", () => {
    const page = view();
    const flags = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`f${i}`, "x".repeat(20)]),
    );
    expect(keepRecipeCookie(page, { ...empty, flags })).toBe(false);
    expect(page.document.cookie).toMatch(/^maple-mock=; Max-Age=0;/);
  });

  it("does nothing where there is no document", () => {
    expect(keepRecipeCookie({ location: { protocol: "https:" } }, layered)).toBe(true);
    expect(keepRecipeCookie(undefined, layered)).toBe(true);
  });
});
