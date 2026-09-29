import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { draftPlacements } from "../src/marks/placement.js";

import type { CommentContext } from "@maple-kit/core";
import type { Draft } from "@maple-kit/core/overlay";

function draft(id: string, url: string | undefined): Draft {
  return {
    id,
    body: id,
    anchor: { selector: "main > section" },
    ...(url === undefined ? {} : { context: { url } as CommentContext }),
    updatedAt: "2026-01-12T10:00:00.000Z",
  };
}

beforeEach(() => {
  const main = document.createElement("main");
  main.append(document.createElement("section"));
  main.dataset["test"] = "";
  document.body.append(main);
});

afterEach(() => {
  for (const node of document.querySelectorAll("main[data-test]")) node.remove();
});

describe("placing drafts from a shared layout", () => {
  const drafts = [
    draft("huila", "https://brew-preview.example.test/roasts/huila"),
    draft("menu", "https://brew-preview.example.test/menu?view=seasonal"),
    draft("legacy", undefined),
  ];

  it("places only the drafts written on this route, and any that never said", () => {
    const placed = draftPlacements(drafts, document, "/roasts/huila");

    expect(placed.map((one) => one.draft.id)).toEqual(["huila", "legacy"]);
  });

  it("follows the route rather than the host", () => {
    const placed = draftPlacements(drafts, document, "/menu");

    expect(placed.map((one) => one.draft.id)).toEqual(["menu", "legacy"]);
  });

  it("places nothing from a route no draft was written on", () => {
    const placed = draftPlacements(drafts.slice(0, 2), document, "/checkout");

    expect(placed).toEqual([]);
  });
});
