import { describe, expect, it } from "vitest";

import { draftRoute, isOnPage, pathOf } from "../src/marks/route.js";

import type { CommentContext } from "@maple-kit/core";
import type { Draft } from "@maple-kit/core/overlay";

function draftAt(url: string | undefined): Draft {
  const context = url === undefined ? undefined : ({ url } as CommentContext);
  return {
    id: "d_1",
    body: "the tasting notes wrap badly",
    anchor: { selector: "main > section" },
    ...(context === undefined ? {} : { context }),
    updatedAt: "2026-01-12T10:00:00.000Z",
  };
}

describe("the path a page is on", () => {
  it.each([
    ["https://brew-preview.example.test/roasts/huila", "/roasts/huila"],
    ["https://brew-preview.example.test/menu?view=seasonal", "/menu"],
    ["https://brew-preview.example.test/menu/", "/menu"],
    ["https://brew-preview.example.test", "/"],
    ["/roasts/huila#notes", "/roasts/huila"],
    ["", undefined],
    [undefined, undefined],
  ])("reads %s as %s", (url, path) => {
    expect(pathOf(url)).toBe(path);
  });
});

describe("whether a draft belongs to the page", () => {
  it.each([
    ["the same path on another host", "https://localhost:3000/roasts/huila", "/roasts/huila", true],
    ["the same path with another query", "https://a.test/menu?view=seasonal", "/menu", true],
    ["another path", "https://a.test/menu", "/roasts/huila", false],
    ["a parent path", "https://a.test/roasts", "/roasts/huila", false],
    ["a draft that recorded no page", undefined, "/roasts/huila", true],
  ])("%s", (_name, url, pathname, expected) => {
    expect(isOnPage(draftAt(url), pathname)).toBe(expected);
  });

  it("keeps the query on the route it links to", () => {
    expect(draftRoute(draftAt("https://a.test/menu?view=seasonal"))).toBe("/menu?view=seasonal");
    expect(draftRoute(draftAt(undefined))).toBeUndefined();
  });
});
