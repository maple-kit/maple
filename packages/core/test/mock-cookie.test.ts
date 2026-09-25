import {
  encodeRecipe,
  InvalidRecipeError,
  readRecipeCookie,
  RECIPE_COOKIE,
  RECIPE_COOKIE_LIMIT,
  recipeCookie,
} from "@maple-kit/core/mock";
import { describe, expect, it } from "vitest";

import type { Recipe } from "@maple-kit/core/mock";

const layered: Recipe = {
  version: 2,
  calls: [{ key: "rest:GET /api/beans", state: "empty" }],
  flags: { "new-roaster": true },
  as: { role: "barista", permissions: { "roasts.delete": false } },
  route: "/beans/:id",
  request: "an empty bean list, as a barista",
};

/** The value a browser would send back for an assignment. */
function sent(assignment: string | undefined): string {
  return (assignment ?? "").split(";")[0] ?? "";
}

describe("recipeCookie", () => {
  it("keeps only the layers a server evaluates", () => {
    const back = readRecipeCookie(sent(recipeCookie(layered, false)));
    expect(back).toEqual({
      version: 2,
      calls: [],
      flags: layered.flags,
      as: layered.as,
      route: "/beans/:id",
    });
  });

  it.each([
    ["only flags", { version: 2, calls: [], flags: { tier: "gold" } }],
    ["only an identity", { version: 2, calls: [], as: { role: "roaster" } }],
  ] as const)("round-trips %s", (_, recipe) => {
    expect(readRecipeCookie(sent(recipeCookie(recipe, false)))).toEqual(recipe);
  });

  const callsAlone: Recipe = { version: 2, calls: layered.calls };

  it.each([
    ["no recipe", undefined],
    ["a recipe of calls alone", callsAlone],
  ])("clears the cookie for %s", (_, recipe) => {
    expect(recipeCookie(recipe, false)).toBe(`${RECIPE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`);
  });

  it("is lax and site-wide, and secure only over HTTPS", () => {
    expect(recipeCookie(layered, false)).toMatch(/; Path=\/; SameSite=Lax$/);
    expect(recipeCookie(layered, true)).toMatch(/; Path=\/; SameSite=Lax; Secure$/);
    expect(recipeCookie(undefined, true)).toMatch(/Max-Age=0; Path=\/; SameSite=Lax; Secure$/);
  });

  it("refuses layers a browser would drop, rather than write half of them", () => {
    const flags = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`beans-${index}`, "a long value"]),
    );
    const large: Recipe = { version: 2, calls: [], flags };
    expect(encodeRecipe(large).length).toBeGreaterThan(RECIPE_COOKIE_LIMIT);
    expect(recipeCookie(large, false)).toBeUndefined();
  });
});

describe("readRecipeCookie", () => {
  const value = sent(recipeCookie(layered, false));

  it.each([
    ["alone", value],
    ["among other cookies", `theme=dark; ${value}; maple_session=x=y`],
    ["with no space after the separator", `theme=dark;${value}`],
  ])("finds the recipe %s", (_, header) => {
    expect(readRecipeCookie(header)?.flags).toEqual(layered.flags);
  });

  it.each([
    ["no header", undefined],
    ["a null header", null],
    ["other cookies only", "theme=dark; maple-mocked=1"],
    ["a cleared cookie", `${RECIPE_COOKIE}=`],
  ])("is undefined for %s", (_, header) => {
    expect(readRecipeCookie(header)).toBeUndefined();
  });

  it("throws on a cookie it cannot read", () => {
    expect(() => readRecipeCookie(`${RECIPE_COOKIE}=%%%`)).toThrow(InvalidRecipeError);
  });
});
