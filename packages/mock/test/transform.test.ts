import { MANY, reshape } from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

import { PROJECTS } from "./msw/api.js";

describe("reshape", () => {
  it.each([
    ["a bare list", "empty", [1, 2], []],
    ["a bare count", "empty", 7, 0],
    ["a count, as one", "one", 7, 1],
    ["a count of zero, as one", "one", 0, 0],
    ["a count, as many", "many", 7, MANY],
    ["a large count, as many", "many", 900, 900],
    ["a string", "empty", "ok", "ok"],
    ["null", "empty", null, null],
    ["an envelope", "empty", PROJECTS, { items: [], total: 0, nextCursor: null, hasMore: false }],
    [
      "an envelope, as one",
      "one",
      PROJECTS,
      { items: [PROJECTS.items[0]], total: 1, nextCursor: null, hasMore: false },
    ],
    [
      "a nested envelope",
      "empty",
      { data: { rows: [1], meta: { total_count: 1, next_page_token: "x" } } },
      { data: { rows: [], meta: { total_count: 0, next_page_token: null } } },
    ],
    [
      "a field that only looks like a count",
      "empty",
      { total: "12 items", nextPage: 2, hasMore: "yes" },
      { total: "12 items", nextPage: 2, hasMore: "yes" },
    ],
    [
      "a list deeper than it looks",
      "empty",
      { a: { b: { c: { d: [1] } } } },
      { a: { b: { c: { d: [1] } } } },
    ],
    ["the lists inside an item", "empty", { items: [{ id: 1, tags: ["x"] }] }, { items: [] }],
  ] as const)("reshapes %s", (_, state, body, expected) => {
    expect(reshape(state, body)).toEqual(expected);
  });

  it("does not modify its input", () => {
    const body = structuredClone(PROJECTS);
    reshape("empty", body);
    reshape("many", body);
    expect(body).toEqual(PROJECTS);
  });

  describe("many", () => {
    const reshaped = reshape("many", PROJECTS) as typeof PROJECTS;

    it("repeats the items it was given", () => {
      expect(reshaped.items).toHaveLength(MANY);
      expect(reshaped.items.slice(0, 2)).toEqual(PROJECTS.items);
      expect(reshaped.items.map((item) => item.name)).toContain("Borealis");
    });

    it("keeps every identifier unique", () => {
      const ids = reshaped.items.map((item) => item.id);
      expect(new Set(ids).size).toBe(MANY);
    });

    it("suffixes a text identifier", () => {
      const users = reshape("many", [{ id: "u_1" }]) as { id: string }[];
      expect(users[1]).toEqual({ id: "u_1-1" });
      expect(new Set(users.map((user) => user.id)).size).toBe(MANY);
    });

    it("keeps the pagination as it was", () => {
      expect(reshaped.nextCursor).toBe("c2");
      expect(reshaped.hasMore).toBe(true);
      expect(reshaped.total).toBe(MANY);
    });

    it("leaves an empty list empty: there is nothing to repeat", () => {
      expect(reshape("many", { items: [] })).toEqual({ items: [] });
    });
  });
});
