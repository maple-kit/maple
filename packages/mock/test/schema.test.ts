import {
  allowsNull,
  arrayOf,
  deflate,
  enumOf,
  MANY,
  property,
  reshape,
  reshapeTyped,
  sampleSchema,
} from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

import type { JsonSchema } from "@maple-kit/core/mock";

/** A page of projects whose cursor is a plain required string: never null. */
function page(cursor: JsonSchema, required: string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      items: { type: "array", items: { $ref: "#/$defs/Project" } },
      total: { type: "integer" },
      nextCursor: cursor,
    },
    required,
    $defs: {
      Project: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          status: { enum: ["active", "paused", "archived"] },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "name", "status", "createdAt"],
      },
    },
  };
}

const BODY = {
  items: [
    { id: 1, name: "Atlas", status: "active", createdAt: "2026-02-01T00:00:00.000Z" },
    { id: 2, name: "Borealis", status: "active", createdAt: "2026-02-02T00:00:00.000Z" },
  ],
  total: 2,
  nextCursor: "c2",
};

describe("reading a schema", () => {
  it.each<[string, JsonSchema, boolean]>([
    ["a type list with null", { type: ["string", "null"] }, true],
    ["OpenAPI 3.0's nullable", { type: "string", nullable: true }, true],
    ["a union with null", { anyOf: [{ type: "string" }, { type: "null" }] }, true],
    ["an enum listing null", { enum: ["a", null] }, true],
    ["a const null", { const: null }, true],
    ["a plain string", { type: "string" }, false],
    ["a union without null", { oneOf: [{ type: "string" }, { type: "integer" }] }, false],
    ["anything at all", true, true],
  ])("says whether %s allows null", (_name, schema, expected) => {
    expect(allowsNull(schema, schema)).toBe(expected);
  });

  it("follows a ref into $defs or components, and merges allOf", () => {
    const root: JsonSchema = {
      components: {
        schemas: { Base: { properties: { id: { type: "string" } }, required: ["id"] } },
      },
      allOf: [{ $ref: "#/components/schemas/Base" }, { properties: { name: { type: "string" } } }],
    };
    expect(property(root, root, "id")).toEqual({ schema: { type: "string" }, required: true });
    expect(property(root, root, "name")).toEqual({ schema: { type: "string" }, required: false });
    expect(property(root, root, "missing")).toBeUndefined();
  });

  it("reads a list's bounds and a union of consts as an enum", () => {
    const list: JsonSchema = { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 };
    expect(arrayOf(list, list)).toEqual({ items: { type: "string" }, min: 2, max: 4 });
    const union: JsonSchema = { anyOf: [{ const: "a" }, { const: "b" }, { type: "null" }] };
    expect(enumOf(union, union)).toEqual(["a", "b"]);
  });

  it("takes a ref cycle for an empty schema rather than looping", () => {
    const root: JsonSchema = { $defs: { A: { $ref: "#/$defs/B" }, B: { $ref: "#/$defs/A" } } };
    expect(allowsNull(root, { $ref: "#/$defs/A" })).toBe(false);
  });
});

/** The DoD's case: without a schema a cursor is nulled; with one, only where it may be. */
describe("an empty page under its schema", () => {
  it.each<[string, JsonSchema, string[], Record<string, unknown>]>([
    ["no schema says otherwise", { type: ["string", "null"] }, [], { nextCursor: null }],
    ["a required string", { type: "string" }, ["nextCursor"], { nextCursor: "c2" }],
    ["an optional string", { type: "string" }, [], {}],
  ])("keeps the cursor valid when it is %s", (_name, cursor, required, expected) => {
    const emptied = reshape("empty", BODY, page(cursor, required));
    expect(emptied).toEqual({ items: [], total: 0, ...expected });
  });

  it("refuses to null a non-nullable cursor, which the schemaless reshape would", () => {
    expect(reshape("empty", BODY)).toMatchObject({ nextCursor: null });
    expect(reshape("empty", BODY, page({ type: "string" }, ["nextCursor"]))).toMatchObject({
      nextCursor: "c2",
    });
  });
});

describe("list bounds and enums", () => {
  const bounded = (min: number, max?: number): JsonSchema => ({
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "object", properties: { id: { type: "integer" } } },
        minItems: min,
        ...(max === undefined ? {} : { maxItems: max }),
      },
    },
  });
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it.each<[string, "empty" | "one" | "many", JsonSchema, number]>([
    ["empty keeps minItems", "empty", bounded(2), 2],
    ["one keeps minItems when it is more than one", "one", bounded(2), 2],
    ["one is one when it may be", "one", bounded(0), 1],
    ["many stops at maxItems", "many", bounded(0, 10), 10],
    ["many is MANY without a bound", "many", bounded(0), MANY],
  ])("%s", (_name, state, schema, length) => {
    const reshaped = reshape(state, { items }, schema) as { items: unknown[] };
    expect(reshaped.items).toHaveLength(length);
  });

  it("cycles a repeated item's enum through every value", () => {
    const many = reshape("many", BODY, page({ type: "string" }, [])) as typeof BODY;
    const statuses = many.items.map((item) => item.status);
    expect(new Set(statuses)).toEqual(new Set(["active", "paused", "archived"]));
    expect(statuses.slice(0, 2)).toEqual(["active", "active"]);
  });

  it("does not cut a long list short without a schema", () => {
    const long = Array.from({ length: MANY + 5 }, (_, id) => ({ id }));
    expect(reshape("many", long)).toHaveLength(MANY + 5);
  });

  it("keeps superjson's dates true on a reshape under a schema", () => {
    const { body, meta } = deflate(sampleSchema(page(true, []), { superjson: true }));
    const many = reshapeTyped("many", body, meta, page(true, []));
    expect(Object.keys(many.meta.values as object)).toHaveLength(MANY);
  });
});

describe("a sample drawn from the schema alone", () => {
  it("is the same every time", () => {
    const schema = page({ type: ["string", "null"] }, []);
    expect(sampleSchema(schema)).toEqual(sampleSchema(schema));
    expect(sampleSchema(schema)).toEqual({
      items: [{ id: 0, name: "text", status: "active", createdAt: "2026-01-01T00:00:00.000Z" }],
      total: 0,
      nextCursor: "text",
    });
  });

  it.each<[string, JsonSchema, unknown]>([
    ["a const", { const: 7 }, 7],
    ["an example over a default", { type: "string", examples: ["ex"], default: "d" }, "ex"],
    ["a nullable string's string", { type: ["null", "string"] }, "text"],
    ["an email", { type: "string", format: "email" }, "reviewer@example.com"],
    ["a minimum", { type: "integer", minimum: 3.2 }, 4],
    ["an exclusive minimum", { type: "integer", exclusiveMinimum: 3 }, 4],
    ["a padded short string", { type: "string", minLength: 6 }, "textxx"],
    ["minItems", { type: "array", items: { type: "boolean" }, minItems: 2 }, [false, false]],
    ["maxItems of zero", { type: "array", items: { type: "boolean" }, maxItems: 0 }, []],
    ["an unknown", {}, null],
  ])("honours %s", (_name, schema, expected) => {
    expect(sampleSchema(schema)).toEqual(expected);
  });

  it("ends a recursive schema instead of recursing", () => {
    const tree: JsonSchema = {
      $ref: "#/$defs/Node",
      $defs: {
        Node: {
          type: "object",
          properties: { children: { type: "array", items: { $ref: "#/$defs/Node" } } },
        },
      },
    };
    expect(JSON.stringify(sampleSchema(tree)).length).toBeLessThan(200);
  });

  it("writes a date as a superjson Date when the call travels in superjson", () => {
    const { body, meta } = deflate(
      sampleSchema(
        { type: "object", properties: { at: { type: "string", format: "date-time" } } },
        {
          superjson: true,
        },
      ),
    );
    expect(body).toEqual({ at: "2026-01-01T00:00:00.000Z" });
    expect(meta).toEqual({ values: { at: ["Date"] }, v: 1 });
  });
});
