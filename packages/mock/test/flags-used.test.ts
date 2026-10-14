import { afterEach, describe, expect, it, vi } from "vitest";

import { createInventory, createMockClient, seenFlags } from "../src/index.js";
import { launchDarklyUsage, launchDarklyUsageHook } from "../src/launchdarkly/index.js";

import type { MockHandle, MockView, PlanLookup } from "../src/index.js";

const REGISTRY = Symbol.for("@maple-kit/mock.flags");

function viewAt(pathname: string): MockView {
  const url = new URL(`https://preview.example.com${pathname}`);
  return {
    location: { href: url.href, pathname, assign: vi.fn(), protocol: url.protocol },
  } as unknown as MockView;
}

function handle(plan?: PlanLookup): MockHandle {
  return {
    recipe: undefined,
    inventory: createInventory(),
    ...(plan ? { plan } : {}),
    dispose: () => undefined,
  };
}

function offered(key: string, value: boolean | string = true): void {
  seenFlags().record({ key, type: typeof value === "boolean" ? "boolean" : "string", value });
}

afterEach(() => {
  delete (globalThis as { [REGISTRY]?: unknown })[REGISTRY];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("launchDarklyUsage", () => {
  it("records a read as used on the route the page is on, as a browser read", () => {
    vi.stubGlobal("location", { pathname: "/beans/7" });
    const inspector = launchDarklyUsage();
    expect(inspector).toMatchObject({ type: "flag-used", synchronous: true });
    inspector.method("new-roaster", { value: true });

    expect(seenFlags().used("/beans/:id")).toEqual([
      { key: "new-roaster", type: "boolean", value: true },
    ]);
    expect(seenFlags().used("/other")).toEqual([]);
    expect(seenFlags().hasUsed()).toBe(true);
  });

  it("is the same through the evaluation hook, which hands the data back", () => {
    vi.stubGlobal("location", { pathname: "/beans" });
    const hook = launchDarklyUsageHook();
    const data = { kept: 1 };
    expect(hook.getMetadata().name).toBe("maple-mock");
    expect(hook.afterEvaluation({ flagKey: "tier" }, data, { value: "gold" })).toBe(data);
    expect(seenFlags().used("/beans")).toEqual([{ key: "tier", type: "string", value: "gold" }]);
  });

  it("lists the real value of a flag the payload offered, not the mocked one it read", () => {
    vi.stubGlobal("location", { pathname: "/beans" });
    offered("tier", "bronze");
    launchDarklyUsage().method("tier", { value: "gold" });
    expect(seenFlags().used("/beans")).toEqual([{ key: "tier", type: "string", value: "bronze" }]);
  });

  it("tells a subscriber when a flag is read", () => {
    vi.stubGlobal("location", { pathname: "/beans" });
    const listener = vi.fn();
    seenFlags().subscribe(listener);
    launchDarklyUsage().method("tier", { value: "gold" });
    launchDarklyUsage().method("tier", { value: "gold" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("the box, with a flag reader installed", () => {
  it("lists on a route only the flags that route read", () => {
    offered("on-a");
    offered("on-b");
    offered("never-read");
    seenFlags().recordUsed({ key: "on-a", route: "/a", type: "boolean", value: true });
    seenFlags().recordUsed({ key: "on-b", route: "/b", type: "boolean", value: true });

    const keys = (path: string) =>
      createMockClient({ view: viewAt(path), handle: handle() })
        .getState()
        .flags.map((row) => row.key);
    expect(keys("/a")).toEqual(["on-a"]);
    expect(keys("/b")).toEqual(["on-b"]);
    expect(keys("/c")).toEqual([]);
  });

  it("sends the plan only the flags the route read", async () => {
    vi.useFakeTimers();
    offered("on-a");
    offered("never-read");
    seenFlags().recordUsed({ key: "on-a", route: "/a", type: "boolean", value: true });
    const plan = vi.fn<PlanLookup>(() => Promise.resolve(null));
    const client = createMockClient({ view: viewAt("/a"), handle: handle(plan) });
    client.setQuery("without it");
    await vi.advanceTimersByTimeAsync(600);

    expect(plan.mock.calls[0]?.[0].flags).toEqual([{ key: "on-a", type: "boolean" }]);
  });
});

describe("the box, with no flag reader installed", () => {
  it("falls back to every flag the page was offered, as before", () => {
    offered("a");
    offered("b");
    expect(seenFlags().hasUsed()).toBe(false);
    const state = createMockClient({ view: viewAt("/a"), handle: handle() }).getState();
    expect(state.flags.map((row) => row.key)).toEqual(["b", "a"]);
  });
});
