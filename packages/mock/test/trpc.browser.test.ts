import { linkRecipe } from "@maple-kit/core/mock";
import { installMock } from "@maple-kit/mock";
import { createTRPCClient, httpBatchLink, httpBatchStreamLink } from "@trpc/client";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handlerFetch } from "./msw/fetch.js";
import {
  batchUrl,
  CREATED,
  createTrpcFake,
  ORIGIN,
  serve,
  STREAM_HEADERS,
  subscriptions,
  TYPED,
} from "./msw/trpc.js";

import type { AppRouter } from "./msw/trpc.js";
import type { MockHandle } from "@maple-kit/mock";

const fake = createTrpcFake();
const nativeFetch = globalThis.fetch;
const page = location.href;
let handle: MockHandle | undefined;

const EMPTY_LIST = {
  version: 1 as const,
  calls: [{ key: "trpc:project.list", state: "empty" as const }],
};
const PATHS = ["project.list", "user.me", "secret", "project.count"];

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

beforeEach(() => {
  globalThis.fetch = handlerFetch(fake.handlers);
  sessionStorage.clear();
  history.replaceState(null, "", linkRecipe(page, EMPTY_LIST));
  handle = installMock();
});

afterEach(() => {
  handle?.dispose();
  handle = undefined;
  globalThis.fetch = nativeFetch;
  history.replaceState(null, "", page);
  fake.reset();
});

describe("installMock with tRPC, in a real browser", () => {
  it.each([
    ["httpBatchLink", httpBatchLink],
    ["httpBatchStreamLink", httpBatchStreamLink],
  ] as const)("empties one call of a batch over %s, and keeps the others real", async (_, link) => {
    const trpc = createTRPCClient<AppRouter>({
      links: [link({ url: `${ORIGIN}${TYPED}`, transformer: superjson })],
    });
    const [list, me, count] = await Promise.all([
      trpc.project.list.query(),
      trpc.user.me.query(),
      trpc.project.count.query(),
    ]);
    expect(list).toEqual({ items: [], total: 0, nextCursor: null });
    expect(me.since).toBeInstanceOf(Date);
    expect(me.since.getTime()).toBe(CREATED.getTime());
    expect(count).toBe(2);
    expect(fake.reached).toHaveLength(1);
  });

  it("leaves every other call of a plain batch byte for byte as the server wrote it", async () => {
    const mocked = (await (await fetch(batchUrl(TYPED, PATHS))).json()) as unknown[];
    const real = (await (await serve(new Request(batchUrl(TYPED, PATHS)))).json()) as unknown[];
    for (const index of [1, 2, 3])
      expect(JSON.stringify(mocked[index])).toBe(JSON.stringify(real[index]));
    expect(JSON.stringify(mocked[0])).toBe(
      '{"result":{"data":{"json":{"items":[],"total":0,"nextCursor":null}}}}',
    );
  });

  it("writes a stream line for line as the server does, but for the one mocked line", async () => {
    const mocked = lines(
      await (await fetch(batchUrl(TYPED, PATHS), { headers: STREAM_HEADERS })).text(),
    );
    const real = lines(
      await (await serve(new Request(batchUrl(TYPED, PATHS), { headers: STREAM_HEADERS }))).text(),
    );
    expect(mocked).toHaveLength(real.length);
    const differing = mocked.filter((line, index) => line !== real[index]);
    expect(differing).toEqual([
      expect.stringContaining('"items":[],"total":0,"nextCursor":null') as string,
    ]);
  });

  it("records the answers of a streamed batch it let through", async () => {
    const trpc = createTRPCClient<AppRouter>({
      links: [httpBatchStreamLink({ url: `${ORIGIN}${TYPED}`, transformer: superjson })],
    });
    await trpc.user.me.query();
    await expect
      .poll(() => handle?.inventory.sample("trpc:user.me", "/")?.meta)
      .toEqual({
        values: { since: ["Date"] },
        v: 1,
      });
  });

  it("lets the page close a subscription read over fetch, and the server stop it", async () => {
    const response = await fetch(`${ORIGIN}${TYPED}/activity.onEvent`);
    const reader = response.body?.getReader();
    let text = "";
    while (!text.includes('"tick":2')) {
      const chunk = await reader?.read();
      text += new TextDecoder().decode(chunk?.value);
    }
    await reader?.cancel();

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect.poll(() => subscriptions.open).toBe(0);
  });
});
