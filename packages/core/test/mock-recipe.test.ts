import {
  describeIdentity,
  InvalidRecipeError,
  MOCK_STATES,
  parseRecipe,
  RECIPE_VERSION,
} from "@maple-kit/core/mock";
import { describe, expect, it } from "vitest";

const call = { key: "trpc:project.list", state: "empty" };

describe("parseRecipe", () => {
  it("returns a recipe it accepts", () => {
    const recipe = { version: 2, calls: [call], request: "an empty state" };
    expect(parseRecipe(recipe)).toEqual(recipe);
  });

  it("keeps the route it applies on", () => {
    const recipe = { version: 2, calls: [call], route: "/projects/:id" };
    expect(parseRecipe(recipe)).toEqual(recipe);
  });

  it("accepts every state it lists", () => {
    const calls = MOCK_STATES.map((state, index) => ({ key: `rest:GET /${index}`, state }));
    expect(parseRecipe({ version: RECIPE_VERSION, calls }).calls).toEqual(calls);
  });

  it("drops fields it does not know", () => {
    const parsed = parseRecipe({ version: 2, calls: [{ ...call, note: "x" }], theme: "dark" });
    expect(parsed).toEqual({ version: 2, calls: [call] });
  });

  it("reads a version 1 recipe and gives it back as the version it writes", () => {
    expect(parseRecipe({ version: 1, calls: [call] })).toEqual({ version: 2, calls: [call] });
  });

  it("keeps flags of any JSON value, as a copy", () => {
    const flags = { "new-dashboard": false, tier: "gold", limit: 3, banner: { text: "hi" } };
    const parsed = parseRecipe({ version: 2, calls: [], flags });
    expect(parsed.flags).toEqual(flags);
    expect(parsed.flags?.["banner"]).not.toBe(flags.banner);
  });

  it.each([
    ["a role", { role: "billing-manager" }],
    ["permissions granted and taken away", { permissions: { "roast:delete": false, beta: true } }],
    ["both", { role: "owner", permissions: { "billing:write": false } }],
  ])("keeps an identity with %s", (_, as) => {
    expect(parseRecipe({ version: 2, calls: [], as }).as).toEqual(as);
  });

  it("returns a copy, not the input", () => {
    const input = { version: 2, calls: [call] };
    const parsed = parseRecipe(input);
    expect(parsed).not.toBe(input);
    expect(parsed.calls[0]).not.toBe(call);
  });

  it.each([
    ["a string", "recipe", /a recipe is an object/],
    ["null", null, /a recipe is an object/],
    ["an array", [], /a recipe is an object/],
    ["no version", { calls: [] }, /version: must be 1 or 2/],
    ["a newer version", { version: 3, calls: [] }, /version: 3 is newer than this build reads/],
    ["calls missing", { version: 2 }, /calls: must be an array/],
    ["a call that is not an object", { version: 2, calls: [1] }, /calls\.0: must be an object/],
    [
      "a key with no codec",
      { version: 2, calls: [{ key: "project.list", state: "empty" }] },
      /calls\.0\.key: must look like "codec:name"/,
    ],
    [
      "an unknown state",
      { version: 2, calls: [{ key: "trpc:a", state: "broken" }] },
      /calls\.0\.state: must be one of empty, error/,
    ],
    [
      "the same key twice",
      { version: 2, calls: [call, { ...call, state: "error" }] },
      /calls\.1\.key: "trpc:project\.list" appears twice/,
    ],
    ["a request that is not text", { version: 2, calls: [], request: 3 }, /request: must be/],
    ["a route that is not a path", { version: 2, calls: [], route: "projects" }, /route: must be/],
    [
      "flags that are a list",
      { version: 2, calls: [], flags: ["beta"] },
      /flags: must be an object/,
    ],
    [
      "a blank flag key",
      { version: 2, calls: [], flags: { " ": true } },
      /flag key must not be blank/,
    ],
    [
      "a flag that is not JSON",
      { version: 2, calls: [], flags: { beta: Number.NaN } },
      /flags\.beta: must be a JSON value/,
    ],
    ["an identity that names nothing", { version: 2, calls: [], as: {} }, /as: must name a role/],
    ["a blank role", { version: 2, calls: [], as: { role: "" } }, /as\.role: must be a non-blank/],
    [
      "a permission that is not true or false",
      { version: 2, calls: [], as: { permissions: { "roast:delete": "no" } } },
      /as\.permissions\.roast:delete: must be true or false/,
    ],
  ])("refuses %s", (_, input, message) => {
    expect(() => parseRecipe(input)).toThrow(InvalidRecipeError);
    expect(() => parseRecipe(input)).toThrow(message);
  });

  it("lists every problem at once", () => {
    const failure = (() => {
      try {
        parseRecipe({ version: 0, calls: [{ key: "", state: "" }], request: 1 });
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toBeInstanceOf(InvalidRecipeError);
    expect((failure as InvalidRecipeError).issues).toHaveLength(4);
  });
});

describe("describeIdentity", () => {
  it.each([
    [undefined, undefined],
    [{ role: "owner" }, "owner"],
    [{ permissions: { "billing:write": false } }, "without billing:write"],
    [
      { role: "owner", permissions: { beta: true, "billing:write": false } },
      "owner, with beta, without billing:write",
    ],
    [{ permissions: {} }, undefined],
  ])("says %j as %j", (as, words) => {
    expect(describeIdentity(as)).toBe(words);
  });
});
