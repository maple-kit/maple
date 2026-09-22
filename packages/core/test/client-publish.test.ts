import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMapleClient } from "../src/client/index.js";
import { parseFence } from "../src/export/markdown.js";
import { createMapleFake, MAPLE_BASE } from "./msw/maple.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { ComposerTarget, MapleClient, MapleClientOptions } from "../src/client/index.js";
import type { MapleFake } from "./msw/maple.js";

const server = createTestServer();
useTestServer(server, { beforeAll, afterEach, afterAll });

let fake: MapleFake;
let tick = Date.parse("2026-09-22T10:00:00.000Z");

function target(component: string): ComposerTarget {
  return { kind: "element", anchor: { component }, label: `the ${component}` };
}

function memoryStorage(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    key: (index: number) => [...held.keys()][index] ?? null,
    removeItem: (key: string) => {
      held.delete(key);
    },
    setItem: (key: string, value: string) => {
      held.set(key, value);
    },
  };
}

function client(overrides: Partial<MapleClientOptions> = {}): MapleClient {
  return createMapleClient({
    branch: "feat/x",
    basePath: MAPLE_BASE,
    storage: memoryStorage(),
    debounceMs: 0,
    now: () => (tick += 1000),
    ...overrides,
  });
}

/** Writes `bodies` as kept drafts, oldest first, and closes the composer. */
function kept(maple: MapleClient, ...bodies: readonly string[]): void {
  bodies.forEach((body, index) => {
    maple.openComposer(target(`Card${String(index)}`));
    maple.setBody(body);
    maple.keepDraft();
  });
}

beforeEach(() => {
  tick = Date.parse("2026-09-22T10:00:00.000Z");
  fake = createMapleFake();
  server.use(...fake.handlers);
});

describe("keeping a comment", () => {
  it("closes the composer and leaves the comment unsent", () => {
    const maple = client();
    maple.openComposer(target("Yield"));
    maple.setBody("The spacing is off.");
    maple.keepDraft();

    expect(maple.getState().composer.open).toBe(false);
    expect(maple.getState().drafts).toHaveLength(1);
    expect(maple.getState().comments).toEqual([]);
  });

  it("throws a blank one away rather than keeping nothing", () => {
    const maple = client();
    maple.openComposer(target("Yield"));
    maple.setBody("   ");
    maple.keepDraft();

    expect(maple.getState().drafts).toEqual([]);
  });
});

describe("publishing what is kept", () => {
  it("sends every draft in one request, oldest first", async () => {
    const maple = client();
    kept(maple, "first", "second", "third");

    const published = await maple.publish();
    expect(published.map((one) => one.body)).toEqual(["first", "second", "third"]);
    expect(maple.getState().drafts).toEqual([]);
    expect(fake.comments().map((one) => one.body)).toEqual(["first", "second", "third"]);
  });

  it("orders the list newest first, as a list of comments already is", async () => {
    const maple = client();
    kept(maple, "first", "second");
    await maple.publish();

    expect(maple.getState().comments.map((one) => one.body)).toEqual(["second", "first"]);
  });

  it("publishes only the drafts it was named", async () => {
    const maple = client();
    kept(maple, "first", "second");
    const [older] = [...maple.getState().drafts].reverse();

    await maple.publish([older!.id]);
    expect(fake.comments().map((one) => one.body)).toEqual(["first"]);
    expect(maple.getState().drafts.map((one) => one.body)).toEqual(["second"]);
  });

  it("takes the open composer's comment with it", async () => {
    const maple = client();
    kept(maple, "kept");
    maple.openComposer(target("Open"));
    maple.setBody("still being written");

    await maple.publish();
    expect(fake.comments().map((one) => one.body)).toEqual(["kept", "still being written"]);
    expect(maple.getState().composer.open).toBe(false);
  });

  it("leaves a composer open on a draft it did not publish", async () => {
    const maple = client();
    kept(maple, "kept");
    const [only] = maple.getState().drafts;
    maple.openComposer(target("Other"));
    maple.setBody("not this one");

    await maple.publish([only!.id]);
    expect(maple.getState().composer.open).toBe(true);
  });

  it("keeps every draft when the route refuses the batch", async () => {
    server.use(
      http.post(`${MAPLE_BASE}/comments`, () =>
        HttpResponse.json({ error: "The store said no" }, { status: 400 }),
      ),
    );
    const maple = client();
    kept(maple, "first", "second");

    await expect(maple.publish()).rejects.toThrow("The store said no");
    expect(maple.getState().drafts).toHaveLength(2);
    expect(maple.getState().publishing).toBe(false);
  });
});

describe("throwing one away from the list", () => {
  it("drops a draft the composer is not on, without opening a panel", () => {
    const maple = client();
    kept(maple, "first", "second");
    const [newest] = maple.getState().drafts;

    maple.discardDraft(newest!.id);
    expect(maple.getState().drafts.map((one) => one.body)).toEqual(["first"]);
    expect(maple.getState().composer.open).toBe(false);
  });
});

describe("the way out with nowhere to publish", () => {
  it("writes every unsent comment as the markdown a published set produces", () => {
    const maple = client();
    kept(maple, "first", "second");

    const markdown = maple.draftsAsMarkdown();
    expect(markdown).toContain("| # | Where | Comment |");
    expect(markdown).toContain("first");
    expect(parseFence(markdown)?.comments.map((one) => one.body)).toEqual(["first", "second"]);
  });

  it("says nothing about an author nobody asked the route for", () => {
    const maple = client();
    kept(maple, "first");
    expect(parseFence(maple.draftsAsMarkdown())?.comments[0]?.author.provenance).toBe("guest");
  });
});
