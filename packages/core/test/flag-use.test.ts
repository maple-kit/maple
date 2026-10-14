import { afterEach, describe, expect, it } from "vitest";

import { recordFlagUse, withFlagUse } from "../src/flags/index.js";
import { launchDarklyFlagUse } from "../src/launchdarkly/index.js";
import { FLAGS_HEADER, formatFlagsHeader, parseFlagsHeader } from "../src/mock/index.js";
import { createMapleHandler } from "../src/route/index.js";

const SWITCH = Symbol.for("@maple-kit/core.flag-use");

function reset(): void {
  delete (globalThis as { [SWITCH]?: unknown })[SWITCH];
}

function turnOn(): void {
  createMapleHandler({ mock: { preview: true } });
}

const later = () => new Promise((done) => setTimeout(done, 5));

afterEach(reset);

describe("withFlagUse", () => {
  it("names the flags a handler read, once preview is on", async () => {
    turnOn();
    const handler = withFlagUse(async (_request: Request) => {
      recordFlagUse("a b");
      await later();
      recordFlagUse("tier");
      recordFlagUse("tier");
      return new Response("ok");
    });
    const response = await handler(new Request("https://x.test/"));
    expect(response.headers.get(FLAGS_HEADER)).toBe("a%20b,tier");
    expect(await response.text()).toBe("ok");
  });

  it("collects nothing when no route switched preview on", async () => {
    const handler = withFlagUse(() => {
      recordFlagUse("tier");
      return new Response("ok");
    });
    expect((await handler()).headers.has(FLAGS_HEADER)).toBe(false);
  });

  it("collects nothing for a route whose preview is off", async () => {
    createMapleHandler({ mock: { preview: false } });
    const handler = withFlagUse(() => {
      recordFlagUse("tier");
      return new Response("ok");
    });
    expect((await handler()).headers.has(FLAGS_HEADER)).toBe(false);
  });

  it("keeps two concurrent requests apart", async () => {
    turnOn();
    const handler = withFlagUse(async (name: string, wait: number) => {
      recordFlagUse(`${name}-before`);
      await new Promise((done) => setTimeout(done, wait));
      recordFlagUse(`${name}-after`);
      return new Response(name);
    });
    const [one, two] = await Promise.all([handler("one", 15), handler("two", 1)]);
    expect(one.headers.get(FLAGS_HEADER)).toBe("one-before,one-after");
    expect(two.headers.get(FLAGS_HEADER)).toBe("two-before,two-after");
  });

  it("does nothing outside a wrapped handler", () => {
    turnOn();
    expect(() => {
      recordFlagUse("loose");
    }).not.toThrow();
  });

  it("sets the header on a response whose headers are immutable", async () => {
    turnOn();
    const handler = withFlagUse(() => {
      recordFlagUse("tier");
      return Response.redirect("https://x.test/next", 302);
    });
    const response = await handler();
    expect(response.status).toBe(302);
    expect(response.headers.get(FLAGS_HEADER)).toBe("tier");
  });
});

describe("the header value", () => {
  it("round-trips keys with commas and spaces", () => {
    const keys = ["a,b", "c d", "é"];
    expect(parseFlagsHeader(formatFlagsHeader(keys))).toEqual(keys);
  });

  it("stops at 4 KB and drops the keys that do not fit", () => {
    const keys = Array.from({ length: 1000 }, (_, at) => `flag-number-${String(at)}`);
    const value = formatFlagsHeader(keys);
    expect(value.length).toBeLessThanOrEqual(4096);
    const kept = parseFlagsHeader(value);
    expect(kept.length).toBeGreaterThan(100);
    expect(kept).toEqual(keys.slice(0, kept.length));
  });

  it("skips what cannot be decoded", () => {
    expect(parseFlagsHeader("ok,%E0%A4%A,,fine")).toEqual(["ok", "fine"]);
    expect(parseFlagsHeader(null)).toEqual([]);
  });
});

describe("launchDarklyFlagUse", () => {
  it("records the flag key and hands the data back", async () => {
    turnOn();
    const hook = launchDarklyFlagUse();
    const data = { kept: 1 };
    const handler = withFlagUse(() => {
      expect(hook.afterEvaluation({ flagKey: "tier" }, data, {})).toBe(data);
      return new Response("ok");
    });
    expect((await handler()).headers.get(FLAGS_HEADER)).toBe("tier");
    expect(hook.getMetadata().name).toBe("maple-flag-use");
  });
});
