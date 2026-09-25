import { describe, expect, it } from "vitest";

import { createShapeIndex, isShape } from "../src/mock/index.js";

import type { SchemaDocument } from "../src/mock/index.js";

const PROJECT = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

function ok(schema: unknown, type = "application/json") {
  return { responses: { "200": { content: { [type]: { schema } } } } };
}

/** The layout a tRPC OpenAPI generator writes: a path per procedure, data under `result`. */
const TRPC: SchemaDocument = {
  codec: "trpc",
  source: "router",
  superjson: true,
  document: {
    openapi: "3.1.0",
    paths: {
      "/project.list": {
        get: ok({
          type: "object",
          properties: {
            result: {
              type: "object",
              properties: {
                data: { type: "array", items: { $ref: "#/components/schemas/Project" } },
              },
            },
          },
        }),
      },
      "/project.create": { post: ok({ type: "object", properties: { id: { type: "string" } } }) },
    },
    components: { schemas: { Project: PROJECT } },
  },
};

const REST: SchemaDocument = {
  codec: "rest",
  prefix: "/api",
  document: {
    openapi: "3.0.3",
    paths: {
      "/projects": { get: ok({ type: "array", items: PROJECT }) },
      "/projects/{projectId}": {
        get: ok(PROJECT, "application/problem+json"),
        delete: { responses: { "204": { description: "gone" } } },
      },
      "/page": { get: { responses: { "200": { content: { "text/html": {} } } } } },
    },
  },
};

describe("normalising OpenAPI into shapes", () => {
  it("keys a tRPC document by procedure, and takes the shape of result.data", () => {
    const index = createShapeIndex([TRPC]);
    const list = index.find("trpc:project.list");

    expect(list).toMatchObject({ source: "router", superjson: true });
    expect(list?.schema).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/Project" },
    });
    expect((list?.schema as { components: unknown }).components).toEqual({
      schemas: { Project: PROJECT },
    });
    expect(index.find("trpc:project.create")?.schema).toMatchObject({ properties: { id: {} } });
  });

  it("keys a REST document by method and prefixed path, matching a template", () => {
    const index = createShapeIndex([REST]);

    expect(index.find("rest:GET /api/projects")?.schema).toMatchObject({ type: "array" });
    expect(index.find("rest:GET /api/projects/:id")?.schema).toEqual(PROJECT);
    expect(index.find("rest:GET /api/projects/my-project")?.schema).toEqual(PROJECT);
    expect(index.find("rest:POST /api/projects/:id")).toBeUndefined();
    expect(index.find("rest:GET /api/projects/:id/members")).toBeUndefined();
  });

  it("leaves out an operation with no JSON 2xx answer", () => {
    const index = createShapeIndex([REST]);
    expect(index.find("rest:DELETE /api/projects/:id")).toBeUndefined();
    expect(index.find("rest:GET /api/page")).toBeUndefined();
    expect(index.size).toBe(2);
  });

  it("lets the first document that describes a key win", () => {
    const override: SchemaDocument = {
      codec: "trpc",
      document: { paths: { "/project.list": { get: ok({ type: "string" }) } } },
    };
    const index = createShapeIndex([override, TRPC]);
    expect(index.find("trpc:project.list")).toEqual({
      source: "supplied",
      schema: { type: "string" },
    });
  });

  it("reads nothing from a document that is not one", () => {
    expect(createShapeIndex([{ codec: "rest", document: "nope" }]).size).toBe(0);
  });
});

describe("a shape on the wire", () => {
  it.each([
    [{ schema: {}, source: "supplied" }, true],
    [{ schema: true, source: "sample", superjson: false }, true],
    [{ schema: {}, source: "guessed" }, false],
    [{ schema: "x", source: "supplied" }, false],
    [{ schema: {}, source: "router", superjson: "yes" }, false],
    [null, false],
  ])("reads %j as a shape: %s", (value, expected) => {
    expect(isShape(value)).toBe(expected);
  });
});
