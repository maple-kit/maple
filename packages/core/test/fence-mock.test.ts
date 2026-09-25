import { describe, expect, it } from "vitest";

import { exportMarkdown, parseFence } from "../src/export/markdown.js";
import { toCommentContext } from "../src/overlay/context.js";
import { SAMPLE_CONTEXT, storedComment } from "../src/testing/fixtures.js";

import type { Recipe } from "../src/mock/recipe.js";

const BRANCH = "feature/roasts";
const RECIPE: Recipe = {
  version: 2,
  calls: [
    { key: "trpc:roast.list", state: "empty" },
    { key: "trpc:roast.count", state: "empty" },
  ],
  route: "/roasts",
  request: "no roasts yet",
};

const mocked = storedComment({ context: { ...SAMPLE_CONTEXT, mock: RECIPE } });

describe("a comment written under a mock", () => {
  it("keeps the recipe through the fence, identical", () => {
    const { markdown } = exportMarkdown([mocked], { branch: BRANCH });
    expect(parseFence(markdown)?.comments[0]?.context.mock).toEqual(RECIPE);
  });

  it("is marked as mocked in the ledger row, and an unmocked one is not", () => {
    const { markdown } = exportMarkdown([mocked, storedComment({ id: "c_2" })], { branch: BRANCH });
    const rows = markdown.split("\n").filter((line) => /^\| [12] \|/.test(line));
    expect(rows[0]).toContain("1440×900 · mocked");
    expect(rows[1]).not.toContain("mocked");
  });

  it("says in the ledger row who the page was told the reviewer was", () => {
    const as = storedComment({
      context: {
        ...SAMPLE_CONTEXT,
        mock: { ...RECIPE, as: { role: "owner", permissions: { "billing:write": false } } },
      },
    });
    const { markdown } = exportMarkdown([as], { branch: BRANCH });
    expect(markdown).toContain("1440×900 · mocked as owner, without billing:write");
    expect(parseFence(markdown)?.comments[0]?.context.mock?.as).toEqual({
      role: "owner",
      permissions: { "billing:write": false },
    });
  });

  it("drops a recipe this build cannot read, and keeps the comment", () => {
    const { markdown } = exportMarkdown([mocked], { branch: BRANCH });
    const broken = markdown.replace('"state":"empty"', '"state":"sideways"');
    const [comment] = parseFence(broken)?.comments ?? [];

    expect(comment?.id).toBe(mocked.id);
    expect(comment?.context.mock).toBeUndefined();
    expect(comment?.context.url).toBe(SAMPLE_CONTEXT.url);
  });

  it("sheds the recipe first when the fence is over budget, and only a recipe there is", () => {
    const long = "x".repeat(400);
    const heavy = Array.from({ length: 12 }, (_, index) =>
      storedComment({
        id: `c_${String(index)}`,
        body: long,
        anchor: { quote: { exact: long, prefix: long, suffix: long } },
        context: { ...SAMPLE_CONTEXT, mock: { ...RECIPE, request: long } },
      }),
    );
    expect(exportMarkdown(heavy, { branch: BRANCH }).reduced[0]).toBe("mock");
    expect(
      exportMarkdown(
        heavy.map((one) => ({ ...one, context: SAMPLE_CONTEXT })),
        { branch: BRANCH },
      ).reduced[0],
    ).toBe("quote-context");
  });

  it("is carried from a captured page into the stored context", () => {
    const context = toCommentContext({
      url: "https://preview.example.com/roasts",
      viewport: { width: 1440, height: 900, contentWidth: 1440, dpr: 2 },
      scheme: "light",
      locale: "en",
      timeZone: "UTC",
      reducedMotion: false,
      regions: [],
      mock: RECIPE,
      capturedAt: "2026-09-25T00:00:00.000Z",
    });
    expect(context.mock).toEqual(RECIPE);
  });
});
