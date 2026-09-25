import { InvalidRecipeError, MOCK_STATES, parseRecipe, RECIPE_VERSION } from "@maple-kit/core/mock";
import { describe, expect, it } from "vitest";

const call = { key: "trpc:project.list", state: "empty" };

describe("parseRecipe", () => {
  it("returns a recipe it accepts", () => {
    const recipe = { version: 1, calls: [call], request: "an empty state" };
    expect(parseRecipe(recipe)).toEqual(recipe);
  });

  it("accepts every state it lists", () => {
    const calls = MOCK_STATES.map((state, index) => ({ key: `rest:GET /${index}`, state }));
    expect(parseRecipe({ version: RECIPE_VERSION, calls }).calls).toEqual(calls);
  });

  it("drops fields it does not know, so a later layer does not break an older reader", () => {
    const parsed = parseRecipe({
      version: 1,
      calls: [{ ...call, note: "x" }],
      flags: { "new-dashboard": false },
    });
    expect(parsed).toEqual({ version: 1, calls: [call] });
  });

  it("returns a copy, not the input", () => {
    const input = { version: 1, calls: [call] };
    const parsed = parseRecipe(input);
    expect(parsed).not.toBe(input);
    expect(parsed.calls[0]).not.toBe(call);
  });

  it.each([
    ["a string", "recipe", /a recipe is an object/],
    ["null", null, /a recipe is an object/],
    ["an array", [], /a recipe is an object/],
    ["no version", { calls: [] }, /version: must be 1/],
    ["a newer version", { version: 2, calls: [] }, /version: 2 is newer than this build reads/],
    ["calls missing", { version: 1 }, /calls: must be an array/],
    ["a call that is not an object", { version: 1, calls: [1] }, /calls\.0: must be an object/],
    [
      "a key with no codec",
      { version: 1, calls: [{ key: "project.list", state: "empty" }] },
      /calls\.0\.key: must look like "codec:name"/,
    ],
    [
      "an unknown state",
      { version: 1, calls: [{ key: "trpc:a", state: "broken" }] },
      /calls\.0\.state: must be one of empty, error/,
    ],
    [
      "the same key twice",
      { version: 1, calls: [call, { ...call, state: "error" }] },
      /calls\.1\.key: "trpc:project\.list" appears twice/,
    ],
    ["a request that is not text", { version: 1, calls: [], request: 3 }, /request: must be/],
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
