import { createInventory, resolve, restCodec, trpcCodec } from "@maple-kit/mock";
import { createTRPCClient, httpBatchLink, httpBatchStreamLink, httpLink } from "@trpc/client";
import superjson from "superjson";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestServer, useTestServer } from "./msw/server.js";
import {
  batchUrl,
  CREATED,
  createTrpcFake,
  ORIGIN,
  PLAIN,
  serve,
  STREAM_HEADERS,
  TYPED,
} from "./msw/trpc.js";

import type { AppRouter } from "./msw/trpc.js";
import type { MockState, Recipe } from "@maple-kit/core/mock";
import type { Inventory } from "@maple-kit/mock";
import type { HTTPBatchLinkOptions } from "@trpc/client";

type Fetcher = NonNullable<HTTPBatchLinkOptions<never>["fetch"]>;

const fake = createTrpcFake();
const server = createTestServer(...fake.handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => fake.reset());

const codec = trpcCodec();
const plainCodec = trpcCodec({ endpoint: PLAIN });

function recipe(...calls: [string, MockState][]): Recipe {
  return { version: 1, calls: calls.map(([key, state]) => ({ key, state })) };
}

/** A `fetch` that does what the interceptor does: resolve, or let through. */
function mockedFetch(
  active: Recipe,
  inventory: Inventory = createInventory(),
  codecs = [trpcCodec(), trpcCodec({ endpoint: PLAIN }), restCodec],
): Fetcher {
  const options = { codecs, forward: fetch, route: "/p" };
  return async (input, init) => {
    const request = new Request(input, init as RequestInit);
    return (await resolve(request.clone(), active, inventory, options)) ?? fetch(request);
  };
}

function client(link: "batch" | "stream" | "single", fetcher: Fetcher) {
  const options = { url: `${ORIGIN}${TYPED}`, transformer: superjson, fetch: fetcher };
  const links = {
    batch: httpBatchLink(options),
    stream: httpBatchStreamLink(options),
    single: httpLink(options),
  };
  return createTRPCClient<AppRouter>({ links: [links[link]] });
}

describe("trpcCodec.split", () => {
  it.each([
    {
      url: `${ORIGIN}/api/trpc/project.list,user.me?batch=1`,
      keys: ["trpc:project.list", "trpc:user.me"],
      flags: { batch: true, stream: false },
    },
    {
      url: `${ORIGIN}/api/trpc/user.me?input=%7B%7D`,
      keys: ["trpc:user.me"],
      flags: { batch: false, stream: false },
    },
    {
      url: `${ORIGIN}/api/trpc/user.me?batch=1`,
      headers: STREAM_HEADERS,
      keys: ["trpc:user.me"],
      flags: { batch: true, stream: true },
    },
    {
      url: `${ORIGIN}/api/trpc/project.list%2Cuser.me?batch=1`,
      keys: ["trpc:project.list", "trpc:user.me"],
      flags: { batch: true, stream: false },
    },
  ])("splits $url", async ({ flags, headers = {}, keys, url }) => {
    const calls = await codec.split(new Request(url, { headers }));
    expect(calls?.map((call) => call.key)).toEqual(keys);
    expect(calls?.[0]).toMatchObject(flags);
  });

  it.each([`${ORIGIN}/api/projects`, `${ORIGIN}/api/trpcx/a`, `${ORIGIN}/api/trpc`])(
    "does not claim %s",
    async (url) => {
      await expect(codec.split(new Request(url))).resolves.toBeUndefined();
    },
  );

  it("drops the stream header from the request it forwards, and nothing else", () => {
    const request = new Request(`${ORIGIN}/api/trpc/a?batch=1`, {
      headers: { ...STREAM_HEADERS, "x-trace": "t1" },
    });
    const prepared = codec.prepare?.(request);
    expect(prepared?.headers.get("trpc-accept")).toBeNull();
    expect(prepared?.headers.get("x-trace")).toBe("t1");
  });
});

describe.each([
  ["superjson", TYPED, codec],
  ["no transformer", PLAIN, plainCodec],
])("trpcCodec, %s, against tRPC's own server", (_, endpoint, owner) => {
  const paths = ["project.list", "user.me", "secret", "project.count"];

  it("re-joins a plain batch byte for byte, status included", async () => {
    const real = await serve(new Request(batchUrl(endpoint, paths)));
    const text = await real.clone().text();
    const calls = (await owner.split(new Request(batchUrl(endpoint, paths)))) ?? [];
    const answers = (await owner.read(real.clone(), calls)) ?? [];
    const joined = owner.join(calls, answers, real);
    expect(joined.status).toBe(207);
    await expect(joined.text()).resolves.toBe(text);
  });

  it("writes a stream exactly as tRPC's own producer does", async () => {
    const streamed = await serve(
      new Request(batchUrl(endpoint, paths), { headers: STREAM_HEADERS }),
    );
    const plain = await serve(new Request(batchUrl(endpoint, paths)));
    const request = new Request(batchUrl(endpoint, paths), { headers: STREAM_HEADERS });
    const calls = (await owner.split(request)) ?? [];
    const answers = (await owner.read(plain, calls)) ?? [];
    const joined = owner.join(calls, answers, plain);
    await expect(joined.text()).resolves.toBe(await streamed.text());
  });

  it("reads a stream into the same answers as the plain batch", async () => {
    const request = new Request(batchUrl(endpoint, paths), { headers: STREAM_HEADERS });
    const calls = (await owner.split(request)) ?? [];
    const fromStream = await owner.read(await serve(request.clone()), calls);
    const fromPlain = await owner.read(await serve(new Request(batchUrl(endpoint, paths))), calls);
    expect(fromStream).toEqual(fromPlain);
  });

  it("reads a single call made without batching", async () => {
    const url = `${ORIGIN}${endpoint}/user.me`;
    const calls = (await owner.split(new Request(url))) ?? [];
    const answers = await owner.read(await serve(new Request(url)), calls);
    expect(answers).toHaveLength(1);
    expect(answers?.[0]).toMatchObject({ kind: "data", status: 200 });
  });

  it("splices one mocked call into a real batch, leaving the others byte for byte", async () => {
    const real = (await (await serve(new Request(batchUrl(endpoint, paths)))).json()) as unknown[];
    const response = await resolve(
      new Request(batchUrl(endpoint, paths)),
      recipe(["trpc:project.list", "empty"]),
      createInventory(),
      { codecs: [owner], forward: fetch, route: "/p" },
    );
    const mocked = (await response?.json()) as unknown[];
    expect(response?.status).toBe(207);
    for (const index of [1, 2, 3]) {
      expect(JSON.stringify(mocked[index])).toBe(JSON.stringify(real[index]));
    }
    expect(JSON.stringify(mocked[0])).toContain('"items":[]');
  });
});

/** An inventory that has seen the list once, as a page that loaded unmocked has. */
async function primed(): Promise<Inventory> {
  const inventory = createInventory();
  await client(
    "batch",
    mockedFetch(recipe(["trpc:project.list", "one"]), inventory),
  ).project.list.query();
  return inventory;
}

describe("resolve, through tRPC's own client", () => {
  it.each(["batch", "stream", "single"] as const)(
    "empties the list and keeps the rest real, over %s",
    async (link) => {
      const trpc = client(link, mockedFetch(recipe(["trpc:project.list", "empty"])));
      const [list, me] = await Promise.all([trpc.project.list.query(), trpc.user.me.query()]);
      expect(list).toEqual({ items: [], total: 0, nextCursor: null });
      expect(me.since).toBeInstanceOf(Date);
      expect(me.since.getTime()).toBe(CREATED.getTime());
    },
  );

  it.each(["batch", "stream"] as const)(
    "keeps every Date a Date under many, over %s",
    async (link) => {
      const trpc = client(link, mockedFetch(recipe(["trpc:project.list", "many"])));
      const list = await trpc.project.list.query();
      expect(list.items).toHaveLength(50);
      expect(list.items.every((item) => item.createdAt instanceof Date)).toBe(true);
      expect(new Set(list.items.map((item) => item.id)).size).toBe(50);
    },
  );

  it.each(["batch", "stream", "single"] as const)(
    "fails one call and not its neighbours, over %s",
    async (link) => {
      const inventory = await primed();
      const trpc = client(link, mockedFetch(recipe(["trpc:project.list", "forbidden"]), inventory));
      const [list, me] = await Promise.allSettled([
        trpc.project.list.query(),
        trpc.user.me.query(),
      ]);
      expect(list.status).toBe("rejected");
      expect((list as PromiseRejectedResult).reason).toMatchObject({
        data: { code: "FORBIDDEN", httpStatus: 403 },
      });
      expect(me.status).toBe("fulfilled");
    },
  );

  it("sends nothing when every call in a batch fails", async () => {
    const inventory = await primed();
    fake.reset();
    const trpc = client("batch", mockedFetch(recipe(["trpc:project.list", "error"]), inventory));
    await expect(trpc.project.list.query()).rejects.toMatchObject({
      data: { code: "INTERNAL_SERVER_ERROR" },
    });
    expect(fake.reached).toEqual([]);
  });

  it("needs the transformer named to fail a call it has never seen", async () => {
    const unseen = client("batch", mockedFetch(recipe(["trpc:project.list", "error"])));
    await expect(unseen.project.list.query()).rejects.not.toMatchObject({
      data: { code: "INTERNAL_SERVER_ERROR" },
    });

    const codecs = [trpcCodec({ transformer: "superjson" })];
    const named = client(
      "batch",
      mockedFetch(recipe(["trpc:project.list", "error"]), undefined, codecs),
    );
    await expect(named.project.list.query()).rejects.toMatchObject({
      data: { code: "INTERNAL_SERVER_ERROR" },
    });
  });

  it("lets a mutation through unless the recipe names it", async () => {
    const trpc = client("batch", mockedFetch(recipe(["trpc:project.list", "empty"])));
    await expect(trpc.project.create.mutate()).resolves.toEqual({ id: 3 });

    fake.reset();
    const failing = client("batch", mockedFetch(recipe(["trpc:project.create", "error"])));
    await expect(failing.project.create.mutate()).rejects.toBeDefined();
    expect(fake.reached).toEqual([]);
  });

  it("records the real answers with their annotations", async () => {
    const inventory = createInventory();
    await client(
      "stream",
      mockedFetch(recipe(["trpc:project.list", "empty"]), inventory),
    ).user.me.query();
    const trpc = client("stream", mockedFetch(recipe(["trpc:project.list", "empty"]), inventory));
    await Promise.all([trpc.project.list.query(), trpc.user.me.query()]);
    const sample = inventory.sample("trpc:project.list", "/p");
    expect(sample?.body).toMatchObject({ total: 2 });
    expect(sample?.meta).toEqual({
      values: { "items.0.createdAt": ["Date"], "items.1.createdAt": ["Date"] },
      referentialEqualities: { "items.0.createdAt": ["items.1.createdAt"] },
      v: 1,
    });
  });
});
