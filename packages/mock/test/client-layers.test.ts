import { decodeRecipe, RECIPE_PARAM } from "@maple-kit/core/mock";
import { describe, expect, it, vi } from "vitest";

import { createInventory, createMockClient, seenFlags } from "../src/index.js";

import type { MockHandle, MockView } from "../src/index.js";
import type { Recipe } from "@maple-kit/core/mock";

const PAGE = "https://preview.example.com/beans/7";
const BEANS = "rest:GET /api/beans";

function view(): { view: MockView; assign: ReturnType<typeof vi.fn> } {
  const url = new URL(PAGE);
  const assign = vi.fn();
  const page = {
    location: { href: url.href, pathname: url.pathname, assign, protocol: url.protocol },
    document: { cookie: "" },
  } as unknown as MockView;
  return { view: page, assign };
}

function handle(recipe?: Recipe, writes: string[] = []): MockHandle {
  return {
    recipe,
    inventory: createInventory(),
    writes: { list: () => writes, subscribe: () => () => undefined },
    dispose: () => undefined,
  };
}

/** A flag key no other test records, since the page's registry is global. */
let counter = 0;
function unique(name: string): string {
  counter += 1;
  return `${name}-${String(counter)}`;
}

describe("flags in the box", () => {
  it("lists the flags the page evaluated, most recent first, with their real values", () => {
    const [roaster, tier] = [unique("roaster"), unique("tier")];
    seenFlags().record({ key: roaster, type: "boolean", value: false });
    seenFlags().record({ key: tier, type: "string", value: "gold", variants: ["gold", "free"] });

    const rows = createMockClient({ view: view().view, handle: handle() }).getState().flags;
    const mine = rows.filter((row) => row.key === roaster || row.key === tier);
    expect(mine).toEqual([
      { key: tier, type: "string", value: "gold", variants: ["gold", "free"], seen: true },
      { key: roaster, type: "boolean", value: false, seen: true },
    ]);
  });

  it("sets a flag, puts it back, and lists one the draft names that the page did not evaluate", () => {
    const [roaster, named] = [unique("roaster"), unique("named")];
    seenFlags().record({ key: roaster, type: "boolean", value: false });
    const client = createMockClient({ view: view().view, handle: handle() });

    client.setFlag(roaster, true);
    client.setFlag(named, "decaf");
    const state = client.getState();
    expect(state.draftFlags).toEqual({ [roaster]: true, [named]: "decaf" });
    expect(state.flags.find((row) => row.key === roaster)?.set).toBe(true);
    expect(state.flags.at(-1)).toEqual({ key: named, type: "string", set: "decaf", seen: false });
    expect(state.changed).toBe(true);

    client.setFlag(roaster, undefined);
    client.setFlag(named, undefined);
    expect(client.getState().draftFlags).toEqual({});
    expect(client.getState().changed).toBe(false);
  });

  it("starts from the active recipe's flags, whichever order they were set in", () => {
    const client = createMockClient({
      view: view().view,
      handle: handle({ version: 2, calls: [], flags: { a: 1, b: { c: true, d: false } } }),
    });
    expect(client.getState().changed).toBe(false);
    client.setFlag("a", undefined);
    client.setFlag("a", 1);
    expect(client.getState().changed).toBe(false);
  });
});

describe("who the page is told the reviewer is", () => {
  it.each([
    [
      "a role",
      (c: ReturnType<typeof createMockClient>) => c.setRole("barista"),
      { role: "barista" },
    ],
    [
      "a permission taken away",
      (c: ReturnType<typeof createMockClient>) => c.setPermission("roasts.delete", false),
      { permissions: { "roasts.delete": false } },
    ],
  ] as const)("drafts %s", (_, act, as) => {
    const client = createMockClient({ view: view().view, handle: handle() });
    act(client);
    expect(client.getState().draftAs).toEqual(as);
    expect(client.getState().changed).toBe(true);
  });

  it("keeps the role and the permissions apart, and says nothing once both are put back", () => {
    const client = createMockClient({ view: view().view, handle: handle() });
    client.setRole("barista");
    client.setPermission("roasts.delete", true);
    client.setRole(undefined);
    expect(client.getState().draftAs).toEqual({ permissions: { "roasts.delete": true } });
    client.setPermission("roasts.delete", undefined);
    expect(client.getState().draftAs).toBeUndefined();
  });

  it("counts the writes that reached the server", () => {
    const client = createMockClient({
      view: view().view,
      handle: handle({ version: 2, calls: [], as: { role: "barista" } }, [BEANS, BEANS]),
    });
    expect(client.getState().writes).toBe(2);
  });
});

describe("a recipe of layers", () => {
  it("applies flags and an identity with no call named", () => {
    const { assign, view: page } = view();
    const client = createMockClient({ view: page, handle: handle() });
    client.setFlag("roaster", true);
    client.setRole("barista");
    client.apply();

    const expected = {
      version: 2,
      calls: [],
      flags: { roaster: true },
      as: { role: "barista" },
      route: "/beans/:id",
    };
    const next = new URL(assign.mock.calls[0]?.[0] as string);
    expect(decodeRecipe(next.searchParams.get(RECIPE_PARAM) ?? "")).toEqual(expected);
    expect(page.document.cookie).toMatch(/^maple-mock=[\w-]+;/);
  });

  it("clears every layer", () => {
    const client = createMockClient({
      view: view().view,
      handle: handle({ version: 2, calls: [{ key: BEANS, state: "empty" }], flags: { a: true } }),
    });
    client.setRole("barista");
    client.clear();
    const state = client.getState();
    expect([state.draft, state.draftFlags, state.draftAs]).toEqual([[], {}, undefined]);
    expect(client.recipe()).toBeUndefined();
  });
});
