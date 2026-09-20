import { describe, expect, it } from "vitest";

import { failureFrom, MapleRequestError } from "../src/client/index.js";

import type { FailedCall, FailureKind } from "../src/client/index.js";

/** Status in, kind out. The kind is what a surface branches on. */
const KINDS: readonly (readonly [number, FailureKind])[] = [
  [401, "unauthorized"],
  [403, "unauthorized"],
  [400, "store"],
  [404, "store"],
  [429, "store"],
  [500, "store"],
  [503, "store"],
];

describe("what a failed call becomes", () => {
  it.each(KINDS)("reads a %i as %s", (status, kind) => {
    const failure = failureFrom(new MapleRequestError(status, "/comments", "no"), "load");

    expect(failure).toMatchObject({ kind, during: "load", status });
  });

  it("calls anything without a status the network, because that is what it is", () => {
    const failure = failureFrom(new TypeError("Failed to fetch"), "send");

    expect(failure.kind).toBe("offline");
    expect(failure.status).toBeUndefined();
  });

  const CALLS: readonly FailedCall[] = ["link", "load", "send", "status"];

  it.each(CALLS)("says something different about a %s", (during) => {
    const failure = failureFrom(new MapleRequestError(401, "/comments", "no"), during);

    expect(failure.during).toBe(during);
    expect(failure.message).not.toHaveLength(0);
  });

  it("never repeats the route's own words, which can name a repository", () => {
    const secretish = "gh_store: acme/private-thing is rate limited until 09:12";
    const failure = failureFrom(new MapleRequestError(429, "/comments", secretish), "load");

    expect(failure.message).not.toContain("private-thing");
  });

  it("tells a reviewer their unsent comment is kept, because it is", () => {
    const failure = failureFrom(new MapleRequestError(500, "/comments", "no"), "send");

    expect(failure.message).toContain("kept");
  });
});
