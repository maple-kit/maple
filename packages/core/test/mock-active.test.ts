import { afterEach, describe, expect, it } from "vitest";

import { activeRecipe, MOCK_HANDLE_KEY } from "../src/mock/active.js";

import type { Recipe } from "../src/mock/recipe.js";

const RECIPE: Recipe = {
  version: 1,
  calls: [{ key: "trpc:roast.list", state: "empty" }],
  route: "/roasts",
  request: "no roasts yet",
};

const global = globalThis as Record<symbol, unknown>;

afterEach(() => {
  delete global[MOCK_HANDLE_KEY];
});

describe("the recipe in force on the page", () => {
  it("is nothing when no mock is installed", () => {
    expect(activeRecipe()).toBeUndefined();
  });

  it("is what the installed handle says applies now, read through the validator", () => {
    global[MOCK_HANDLE_KEY] = { current: () => RECIPE };
    expect(activeRecipe()).toEqual(RECIPE);
  });

  it.each<[string, unknown]>([
    ["a handle with no current()", { recipe: RECIPE }],
    ["a handle whose recipe does not apply here", { current: () => undefined }],
    [
      "an unreadable recipe",
      { current: () => ({ version: 1, calls: [{ key: "x", state: "gone" }] }) },
    ],
    [
      "a current() that throws",
      {
        current: () => {
          throw new Error("boom");
        },
      },
    ],
    ["something that is not a handle", "handle"],
  ])("is nothing for %s", (_name, handle) => {
    global[MOCK_HANDLE_KEY] = handle;
    expect(activeRecipe()).toBeUndefined();
  });

  it("is the key @maple-kit/mock leaves its handle under", () => {
    expect(MOCK_HANDLE_KEY).toBe(Symbol.for("@maple-kit/mock.installed"));
  });
});
