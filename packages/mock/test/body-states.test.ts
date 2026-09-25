import { deflate, MANY, reshape, reshapeTyped } from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

import { PROJECTS } from "./msw/api.js";

import type { JsonSchema } from "@maple-kit/core/mock";

/** A page of reviews: an enum, a boolean, a nullable, an optional, bounds. */
const PAGE: JsonSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: { $ref: "#/$defs/Review" }, maxItems: 20 },
    total: { type: "integer" },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["items", "total", "nextCursor"],
  $defs: {
    Review: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string", maxLength: 60 },
        branch: { type: "string" },
        state: { enum: ["open", "approved", "blocked"] },
        draft: { type: "boolean" },
        reviewer: { type: ["string", "null"] },
        note: { type: "string" },
        link: { type: "string", format: "uri" },
        author: { type: "string", format: "email" },
        opened: { type: "string", format: "date-time" },
        score: { type: "number", maximum: 5 },
        comments: { type: "integer", minimum: 0 },
      },
      required: ["id", "title", "branch", "state", "draft", "reviewer", "link", "author"],
    },
  },
};

const REVIEW = {
  id: "r_1",
  title: "Fix the roast chart",
  branch: "fix/chart",
  state: "open",
  draft: false,
  reviewer: "Ana",
  note: "Looks close",
  link: "https://git.example.com/beans/pull/1",
  author: "ana@example.com",
  opened: "2026-02-01T00:00:00.000Z",
  score: 4,
  comments: 3,
};

const BODY = { items: [REVIEW], total: 1, nextCursor: "c2" };

type Page = { items: Record<string, unknown>[]; total: number; nextCursor: unknown };

describe("long", () => {
  const withSchema = reshape("long", BODY, PAGE) as Page;
  const without = reshape("long", BODY) as Page;
  const item = withSchema.items[0] ?? {};
  const bare = without.items[0] ?? {};

  it("keeps every list its length", () => {
    expect(withSchema.items).toHaveLength(1);
    expect(reshape("long", PROJECTS)).toMatchObject({ items: [{}, {}] });
  });

  it("lengthens a text to its maxLength exactly, from its own words", () => {
    expect(item["title"]).toHaveLength(60);
    expect(String(item["title"]).startsWith("Fix the roast chart Fix the roast chart")).toBe(true);
  });

  it("repeats a text's own words with a space between, never glued into a run", () => {
    const words = new Set(REVIEW.title.split(" "));
    const tokens = String(item["title"]).split(" ");
    expect(tokens.slice(0, -1).every((token) => words.has(token))).toBe(true);
  });

  it("grows a name that is already one run, like a branch, as one longer name", () => {
    const branch = String(item["branch"]);
    expect(branch.length).toBeGreaterThanOrEqual(Math.max(32, "fix/chart".length * 4));
    expect(branch.startsWith("fix/chart-fix-chart-")).toBe(true);
    expect(branch.endsWith("-chart")).toBe(true);
    expect(branch).not.toMatch(/\s/);
  });

  it("grows a name as whole words, not as a run of its letters", () => {
    const reviewer = String(item["reviewer"]);
    expect(reviewer.split(" ").every((word) => word === "Ana")).toBe(true);
    expect(reviewer.length).toBeGreaterThanOrEqual(32);
  });

  it.each([
    ["an address, by its format", item],
    ["an address, by its shape", bare],
  ])("grows the local part of %s and keeps it valid", (_, reviewed) => {
    const author = String(reviewed["author"]);
    expect(author.endsWith("@example.com")).toBe(true);
    expect(author.length).toBeGreaterThan(REVIEW.author.length);
    expect(author.split("@")[0]?.length).toBeLessThanOrEqual(64);
    expect(author).not.toMatch(/\.\.|\.@/);
  });

  it.each([
    ["a URL, by its format", item],
    ["a URL, by its shape", bare],
  ])("grows %s from its middle and keeps it a URL", (_, reviewed) => {
    const link = String(reviewed["link"]);
    expect(URL.canParse(link)).toBe(true);
    expect(link.startsWith("https://git.example.com/")).toBe(true);
    expect(link.endsWith("/beans/pull/1")).toBe(true);
    expect(link.length).toBeGreaterThanOrEqual(REVIEW.link.length * 4);
  });

  it("leaves identifiers, enums and dates alone", () => {
    expect(item).toMatchObject({ id: "r_1", state: "open", opened: REVIEW.opened });
    expect(bare).toMatchObject({ id: "r_1", state: "open", opened: REVIEW.opened });
  });

  it("widens a number to 1,234,567, within its schema's bounds", () => {
    expect(item["comments"]).toBe(1_234_567);
    expect(item["score"]).toBe(5);
    expect(bare["score"]).toBe(1_234_567);
    expect(withSchema.total).toBe(1_234_567);
  });

  it("leaves a fraction and a timestamp alone without a schema", () => {
    expect(reshape("long", { ratio: 0.4, at: 1_767_225_600_000 })).toEqual({
      ratio: 0.4,
      at: 1_767_225_600_000,
    });
  });

  it("leaves a single lowercase word alone without a schema: it may be an enum", () => {
    expect(reshape("long", { kind: "espresso", name: "Espresso" })).toMatchObject({
      kind: "espresso",
    });
  });
});

describe("sparse", () => {
  it("nulls what is nullable and drops what is optional, under a schema", () => {
    const thinned = reshape("sparse", BODY, PAGE) as Page;
    expect(thinned.nextCursor).toBeNull();
    expect(thinned.items).toHaveLength(1);
    expect(thinned.items[0]).toEqual({
      id: "r_1",
      title: REVIEW.title,
      branch: REVIEW.branch,
      state: "open",
      draft: false,
      reviewer: null,
      link: REVIEW.link,
      author: REVIEW.author,
    });
  });

  it("drops only what the recording proves may be missing, without one", () => {
    const body = {
      items: [
        { id: 1, name: "Atlas", avatar: "a.png", owner: "Ana" },
        { id: 2, name: "Borealis", owner: null },
      ],
      total: 2,
    };
    expect(reshape("sparse", body)).toEqual({
      items: [
        { id: 1, name: "Atlas", owner: null },
        { id: 2, name: "Borealis", owner: null },
      ],
      total: 2,
    });
  });

  it("guesses nothing about a lone object without a schema", () => {
    expect(reshape("sparse", REVIEW)).toEqual(REVIEW);
    expect(reshape("sparse", PROJECTS)).toEqual(PROJECTS);
  });
});

describe("mixed", () => {
  const covered = reshape("mixed", BODY, PAGE) as Page;
  const column = (key: string) => covered.items.map((item) => item[key]);

  it("covers every value each field may take", () => {
    expect(new Set(column("state"))).toEqual(new Set(["open", "approved", "blocked"]));
    expect(new Set(column("draft"))).toEqual(new Set([true, false]));
    expect(column("reviewer")).toContain(null);
    expect(column("reviewer").some((value) => typeof value === "string")).toBe(true);
    expect(covered.items.some((item) => !("note" in item))).toBe(true);
    expect(covered.items.some((item) => "note" in item)).toBe(true);
  });

  it("holds short and long text", () => {
    const lengths = column("title").map((title) => String(title).length);
    expect(lengths).toContain(REVIEW.title.length);
    expect(lengths).toContain(60);
  });

  it("grows the list only as far as covering needs, ids unique", () => {
    expect(covered.items.length).toBeGreaterThan(1);
    expect(covered.items.length).toBeLessThan(MANY);
    expect(new Set(column("id")).size).toBe(covered.items.length);
  });

  it("keeps the count: mixed is about kinds, not how many", () => {
    expect(covered.total).toBe(1);
  });

  it("respects maxItems", () => {
    const bounded = { ...PAGE, properties: { ...(PAGE as { properties: object }).properties } };
    const one = structuredClone(bounded) as { properties: { items: { maxItems: number } } };
    one.properties.items.maxItems = 2;
    expect((reshape("mixed", BODY, one as JsonSchema) as Page).items).toHaveLength(2);
  });

  it("covers both booleans, nulls and absences it sees, without a schema", () => {
    const body = [
      { id: 1, name: "Atlas", pinned: true, owner: "Ana", tag: "x" },
      { id: 2, name: "Borealis", pinned: true, owner: null },
    ];
    const items = reshape("mixed", body) as Record<string, unknown>[];
    expect(new Set(items.map((item) => item["pinned"]))).toEqual(new Set([true, false]));
    expect(items.map((item) => item["owner"])).toContain(null);
    expect(items.some((item) => !("tag" in item))).toBe(true);
    expect(new Set(items.map((item) => item["id"])).size).toBe(items.length);
  });

  it("leaves a list of scalars as it was", () => {
    expect(reshape("mixed", { tags: ["a", "b"] })).toEqual({ tags: ["a", "b"] });
  });
});

describe.each(["long", "sparse", "mixed"] as const)("%s, typed", (state) => {
  it("keeps superjson's Dates Dates", () => {
    const opened = { __date: "2026-02-01T00:00:00.000Z" };
    const typedPage: JsonSchema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              opened: { type: "string", format: "date-time" },
            },
            required: ["id", "name", "opened"],
          },
        },
      },
      required: ["items"],
    };
    const body = { items: [{ id: 1, name: "Atlas", opened: opened.__date }] };
    const meta = { values: { "items.0.opened": ["Date"] }, v: 1 };
    const reshaped = reshapeTyped(state, body, meta, typedPage);
    const items = (reshaped.body as { items: { opened: string }[] }).items;
    const values = reshaped.meta.values as Record<string, unknown>;
    items.forEach((item, index) => {
      expect(item.opened).toBe(opened.__date);
      expect(values[`items.${String(index)}.opened`]).toEqual(["Date"]);
    });
  });

  it("does not modify its input", () => {
    const body = structuredClone(BODY);
    reshape(state, body, PAGE);
    reshape(state, body);
    expect(body).toEqual(BODY);
  });
});

it("samples a Date for a field mixed sets where no item holds one", () => {
  const schema: JsonSchema = {
    type: "array",
    items: {
      type: "object",
      properties: { id: { type: "integer" }, closed: { type: "string", format: "date-time" } },
      required: ["id"],
    },
  };
  const { body, meta } = deflate([{ id: 1 }]);
  const reshaped = reshapeTyped("mixed", body, meta, schema);
  const items = reshaped.body as { closed?: string }[];
  const set = items.findIndex((item) => item.closed !== undefined);
  expect(set).toBeGreaterThanOrEqual(0);
  expect(reshaped.meta.values).toMatchObject({ [`${String(set)}.closed`]: ["Date"] });
});
