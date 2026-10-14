import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createPullCache,
  NEGATIVE_TTL_MS,
  POSITIVE_TTL_MS,
  resolvePull,
} from "../src/connectors/github-pull.js";
import { pullReader } from "../src/connectors/github.js";
import { AmbiguousPullError } from "../src/errors.js";
import { createPullsFake } from "./msw/github-pulls.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { FakePull } from "./msw/github-pulls.js";

const SHA = "a1b2c3d4e5f6a1b2c3d4";

const github = createPullsFake();
const server = createTestServer(...github.handlers);
useTestServer(server, { beforeAll, afterEach, afterAll });
afterEach(() => {
  github.reset();
  vi.useRealTimers();
});

const pull = (number: number, head: string, overrides: Partial<FakePull> = {}): FakePull => ({
  number,
  head,
  sha: SHA,
  state: "open",
  ...overrides,
});

const reader = (token = "ghu_a") => pullReader({ owner: "maple-kit", repo: "app", token });

describe("a commit that sits in a stack of open pull requests", () => {
  const stack = () => github.add(pull(8, "feat/parent"), pull(9, "feat/child"));

  it("prefers the pull request whose head is the key", async () => {
    stack();
    const found = await resolvePull(reader(), "feat/child", { commit: SHA }, undefined);
    expect(found).toEqual({ number: 9, head: "feat/child" });
  });

  it("falls through to matches when the key names no head", async () => {
    stack();
    const matches = (head: string) => head === "feat/parent";
    const found = await resolvePull(reader(), "feat-parent", { commit: SHA, matches }, undefined);
    expect(found).toEqual({ number: 8, head: "feat/parent" });
  });

  it("is ambiguous only when nothing later chooses", async () => {
    stack();
    const lookup = resolvePull(reader(), "feat-x", { commit: SHA }, undefined);
    await expect(lookup).rejects.toBeInstanceOf(AmbiguousPullError);
  });
});

describe("the head branch named exactly the key", () => {
  it("is open-only for a preview", async () => {
    github.add(pull(3, "feat/done", { state: "closed", sha: "f".repeat(20) }));
    const found = await resolvePull(reader(), "feat/done", { openOnly: true }, undefined);
    expect(found).toBeUndefined();
  });

  it("falls back to a closed one without openOnly, for a store", async () => {
    github.add(pull(3, "feat/done", { state: "closed", sha: "f".repeat(20) }));
    const found = await resolvePull(reader(), "feat/done", undefined, undefined);
    expect(found).toEqual({ number: 3, head: "feat/done" });
  });
});

describe("what the cache keeps", () => {
  it("believes a hit for the positive TTL, then picks up a new pull request", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const cache = createPullCache();
    const lookup = { openOnly: true };
    github.add(pull(1, "feat/x", { sha: "c".repeat(20) }));
    expect((await resolvePull(reader(), "feat/x", lookup, cache))?.number).toBe(1);

    github.reset();
    github.add(pull(2, "feat/x", { sha: "c".repeat(20) }));
    expect((await resolvePull(reader(), "feat/x", lookup, cache))?.number).toBe(1);

    vi.advanceTimersByTime(POSITIVE_TTL_MS + 1);
    expect((await resolvePull(reader(), "feat/x", lookup, cache))?.number).toBe(2);
  });

  it("does not hand one token's resolution to another", async () => {
    const cache = createPullCache();
    github.add(pull(1, "feat/x", { sha: "c".repeat(20) }));
    await resolvePull(reader("ghu_a"), "feat/x", undefined, cache);

    github.fail(404);
    const other = resolvePull(reader("ghu_b"), "feat/x", undefined, cache);
    await expect(other).rejects.toMatchObject({ status: 404 });
  });

  it("does not hand one token's refusal to another", async () => {
    const cache = createPullCache();
    github.fail(403);
    await expect(resolvePull(reader("ghu_a"), "feat/x", undefined, cache)).rejects.toBeDefined();

    github.reset();
    github.add(pull(1, "feat/x", { sha: "c".repeat(20) }));
    const found = await resolvePull(reader("ghu_b"), "feat/x", undefined, cache);
    expect(found?.number).toBe(1);
    expect(NEGATIVE_TTL_MS).toBeGreaterThan(0);
  });
});
