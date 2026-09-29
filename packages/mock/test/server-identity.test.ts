import { encodeRecipe, linkRecipe } from "@maple-kit/core/mock";
import { displayedIdentity } from "@maple-kit/mock/server";
import { describe, expect, it } from "vitest";

import type { Recipe } from "@maple-kit/core/mock";

const PAGE = "https://preview.example/beans/7";
const rules = {
  preview: true,
  roles: ["owner", "barista", "trainee"],
  permissions: ["roast:delete"],
};

const request = (recipe?: Recipe) => ({
  url: recipe === undefined ? PAGE : linkRecipe(PAGE, recipe).href,
  headers: {},
});
const as = (shown: NonNullable<Recipe["as"]>): Recipe => ({ version: 2, calls: [], as: shown });

const real = {
  id: "u_1",
  name: "Sam",
  role: "barista",
  permissions: ["roast:delete", "orders:read"],
};

describe("displayedIdentity", () => {
  it.each([
    ["no recipe", request(), rules],
    ["a recipe with no `as`", request({ version: 2, calls: [] }), rules],
    [
      "a build that is not a preview",
      request(as({ role: "trainee" })),
      { ...rules, preview: false },
    ],
    ["a role the rules do not list", request(as({ role: "wizard" })), rules],
    ["a recipe it cannot read", { url: `${PAGE}?maple-mock=x`, headers: {} }, rules],
  ])("gives back the real identity for %s", (_, asked, options) => {
    expect(displayedIdentity(asked, real, options)).toBe(real);
  });

  it("replaces the role and leaves the rest of the identity alone", () => {
    const shown = displayedIdentity(request(as({ role: "trainee" })), real, rules);
    expect(shown).toEqual({ ...real, role: "trainee" });
    expect(real.role).toBe("barista");
  });

  it("replaces every role when the host has several, and keeps `role` off an identity without one", () => {
    const many = { id: "u_1", roles: ["barista", "owner"] };
    expect(displayedIdentity(request(as({ role: "trainee" })), many, rules)).toEqual({
      id: "u_1",
      roles: ["trainee"],
    });
  });

  it("grants and takes away permissions the rules list, and ignores one they do not", () => {
    const shown = displayedIdentity(
      request(as({ permissions: { "roast:delete": false, "orders:write": true } })),
      real,
      rules,
    );
    expect(shown).toEqual({ ...real, permissions: ["orders:read"] });

    const granted = displayedIdentity(
      request(as({ permissions: { "roast:approve": true } })),
      real,
      { ...rules, permissions: ["roast:approve"] },
    );
    expect(granted.permissions).toEqual(["roast:delete", "orders:read", "roast:approve"]);
  });

  it("reads the cookie the box keeps, as a request's headers carry it", () => {
    const cookie = `maple-mock=${encodeRecipe(as({ role: "owner" }))}`;
    const shown = displayedIdentity({ url: PAGE, headers: { cookie } }, real, rules);
    expect(shown.role).toBe("owner");
  });

  it("keeps nobody as nobody", () => {
    expect(displayedIdentity(request(as({ role: "owner" })), null, rules)).toBeNull();
  });
});
