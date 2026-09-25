import { holdStreams } from "@maple-kit/mock";
import { launchDarklyFlags } from "@maple-kit/mock/launchdarkly";
import { afterEach, describe, expect, it } from "vitest";

import { LD_BASE, LD_ENV, LD_FLAGS } from "./msw/launchdarkly.js";

const source = launchDarklyFlags({ baseUri: LD_BASE, streamUri: LD_BASE });
const defaults = launchDarklyFlags();

describe("launchDarklyFlags, the poll", () => {
  it.each([
    [
      "a GET for a context",
      defaults,
      "GET",
      "https://clientsdk.launchdarkly.com/sdk/evalx/e1/contexts/eyJr",
      true,
    ],
    [
      "a REPORT",
      defaults,
      "REPORT",
      "https://clientsdk.launchdarkly.com/sdk/evalx/e1/context",
      true,
    ],
    ["the goals", defaults, "GET", "https://clientsdk.launchdarkly.com/sdk/goals/e1", false],
    [
      "the page's own API",
      defaults,
      "GET",
      "https://preview.example/api/sdk/evalx/e1/context",
      false,
    ],
    [
      "a baseUri under a path",
      source,
      "GET",
      `${LD_BASE}/sdk/evalx/${LD_ENV}/contexts/eyJr?withReasons=true`,
      true,
    ],
    [
      "the same path off the baseUri's prefix",
      source,
      "GET",
      `https://flags.preview.example/sdk/evalx/${LD_ENV}/context`,
      false,
    ],
  ])("claims %s", (...[, flags, method, url, claimed]) => {
    expect(flags.claims(new Request(url, { method }))).toBe(claimed);
  });

  it("reads each flag's value", () => {
    expect(source.read(LD_FLAGS)).toEqual({ "new-roaster": false, "roast-limit": 3 });
    expect(source.read([1])).toBeUndefined();
  });

  it("writes a named flag in with a version no real change passes, and drops what described the real one", () => {
    const written = source.write(
      { ...LD_FLAGS, other: { value: "x", version: 1 } },
      { "new-roaster": true, added: "on" },
    );
    expect(written).toEqual({
      "new-roaster": {
        value: true,
        version: Number.MAX_SAFE_INTEGER,
        flagVersion: 3,
        trackEvents: false,
      },
      "roast-limit": LD_FLAGS["roast-limit"],
      other: { value: "x", version: 1 },
      added: { value: "on", version: Number.MAX_SAFE_INTEGER },
    });
  });
});

describe("launchDarklyFlags, the stream", () => {
  const stream = source.stream!;
  const flags = { "new-roaster": true };

  it.each([
    ["its eval stream", `${LD_BASE}/eval/${LD_ENV}/eyJr`, true],
    ["its ping stream", `${LD_BASE}/ping/${LD_ENV}`, true],
    ["any other stream", "https://preview.example/api/trpc/onRoast", false],
  ])("claims %s", (_, url, claimed) => {
    expect(stream.claims(url)).toBe(claimed);
  });

  it.each([
    [
      "a put, rewritten",
      "put",
      JSON.stringify(LD_FLAGS),
      JSON.stringify(source.write(LD_FLAGS, flags)),
    ],
    [
      "a patch to a named flag, dropped",
      "patch",
      '{"key":"new-roaster","value":false,"version":8}',
      undefined,
    ],
    ["a delete of a named flag, dropped", "delete", '{"key":"new-roaster","version":9}', undefined],
    [
      "a patch to another flag, kept",
      "patch",
      '{"key":"roast-limit","value":4,"version":5}',
      '{"key":"roast-limit","value":4,"version":5}',
    ],
    ["a ping, kept", "ping", "", ""],
    ["a put it cannot read, kept", "put", "{", "{"],
  ])("passes %s", (_, type, data, expected) => {
    expect(stream.event(type, data, flags)).toBe(expected);
  });
});

describe("holdStreams", () => {
  const native = globalThis.EventSource;

  class FakeEventSource extends EventTarget {
    constructor(readonly url: string) {
      super();
    }
    send(type: string, data: string) {
      this.dispatchEvent(new MessageEvent(type, { data }));
    }
  }

  afterEach(() => {
    globalThis.EventSource = native;
  });

  it("reads a claimed stream through its source, leaves the rest, and undoes itself", () => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
    const undo = holdStreams([source], { "new-roaster": true });

    const held = new EventSource(`${LD_BASE}/eval/${LD_ENV}/eyJr`) as unknown as FakeEventSource;
    const other = new EventSource("https://preview.example/events") as unknown as FakeEventSource;
    const heard: string[] = [];
    const listener = (event: Event) => heard.push((event as MessageEvent<string>).data);
    held.addEventListener("patch", listener);
    other.addEventListener("patch", listener);

    held.send("patch", '{"key":"new-roaster","value":false,"version":8}');
    held.send("patch", '{"key":"roast-limit","value":4,"version":5}');
    other.send("patch", '{"key":"new-roaster"}');
    held.removeEventListener("patch", listener);
    held.send("patch", '{"key":"roast-limit","value":5,"version":6}');

    expect(heard).toEqual(['{"key":"roast-limit","value":4,"version":5}', '{"key":"new-roaster"}']);
    undo();
    expect(globalThis.EventSource).toBe(FakeEventSource);
  });
});
