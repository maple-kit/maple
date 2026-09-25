import { describe, expect, it } from "vitest";

import { bannerSentence, callName, codecOf } from "../src/mock/index.js";

describe("the banner's sentence", () => {
  it.each([
    [[], "Mock on"],
    [[{ key: "rest:GET /api/reviews", state: "empty" }], "Mock on: GET /api/reviews is empty"],
    [[{ key: "trpc:user.me", state: "error" }], "Mock on: user.me fails"],
    [
      [
        { key: "trpc:project.list", state: "loading" },
        { key: "trpc:user.me", state: "forbidden" },
        { key: "rest:GET /a", state: "many" },
      ],
      "Mock on: project.list never answers and 2 more",
    ],
  ] as const)("names %j as %j", (calls, said) => {
    expect(bannerSentence(calls)).toBe(said);
  });
});

describe("a call's key, taken apart for a row", () => {
  it.each([
    ["rest:GET /api/projects/:id", "rest", "GET /api/projects/:id"],
    ["trpc:project.list", "trpc", "project.list"],
    ["nocodec", "", "nocodec"],
  ])("splits %s into %s and %s", (key, codec, name) => {
    expect(codecOf(key)).toBe(codec);
    expect(callName(key)).toBe(name);
  });
});
