import { describe, expect, it } from "vitest";

import { summarise } from "../src/route/summary.js";

import type { JsonSchema } from "../src/mock/shape.js";

const ROAST: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    origin: { type: "string" },
    status: { enum: ["green", "roasted"] },
  },
};

const PAGE: JsonSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/Roast" } },
    nextCursor: { type: ["string", "null"] },
  },
  components: { schemas: { Roast: ROAST } },
};

describe("what the route tells a planner about a call", () => {
  it.each<[string, string, JsonSchema | undefined, string]>([
    ["the page's words, with no schema", "name, tint", undefined, "name, tint"],
    [
      "the schema's, with nothing from the page",
      "",
      PAGE,
      "items [Roast: id, origin, status], nextCursor",
    ],
    [
      "a component by its name",
      "",
      { $ref: "#/c/Roast", c: { Roast: ROAST } },
      "Roast: id, origin, status",
    ],
    [
      "a list of components",
      "",
      { type: "array", items: { $ref: "#/x/Bean" }, x: { Bean: ROAST } },
      "list of [Bean: id, origin, status]",
    ],
    [
      "the schema's, when it names what the page did and more",
      "items [id, origin, status], nextCursor",
      PAGE,
      "items [Roast: id, origin, status], nextCursor",
    ],
    [
      "the page's, when the schema says nothing new",
      "items [Roast: id, origin, status], nextCursor, total",
      PAGE,
      "items [Roast: id, origin, status], nextCursor, total",
    ],
    [
      "both, when each says something the other does not",
      "total",
      PAGE,
      "total — items [Roast: id, origin, status], nextCursor",
    ],
    [
      "a title over a component's name",
      "",
      { $ref: "#/c/R", c: { R: { ...ROAST, title: "A roast" } } },
      "A roast: id, origin, status",
    ],
    ["nothing past a ref outside the schema", "", { $ref: "other.json#/Roast" }, ""],
    ["nothing for a schema that accepts anything", "count", true, "count"],
  ])("%s", (_name, page, schema, summary) => {
    expect(summarise(page, schema)).toBe(summary);
  });

  it("stops following refs that point at each other", () => {
    const loop: JsonSchema = { $ref: "#/a", a: { $ref: "#/b" }, b: { $ref: "#/a" } };
    expect(summarise("", loop)).toBe("");
  });

  it("never carries a value, only names", () => {
    const withExample: JsonSchema = {
      ...ROAST,
      examples: [{ id: "r_1", origin: "Huila" }],
      default: { id: "r_0" },
    };
    expect(summarise("", withExample)).not.toMatch(/r_1|Huila|r_0/);
  });
});
