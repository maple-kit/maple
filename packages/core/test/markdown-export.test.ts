import { describe, expect, it } from "vitest";

import {
  exportMarkdown,
  FENCE_VERSION,
  parseFence,
  UnsupportedFenceError,
} from "../src/export/index.js";
import { storedComment } from "../src/testing/fixtures.js";

import type { Comment } from "../src/types.js";

const BRANCH = "feature/x";

function exported(comments: readonly Comment[], options = {}): string {
  return exportMarkdown(comments, { branch: BRANCH, ...options }).markdown;
}

function fenceOf(markdown: string): ReturnType<typeof parseFence> {
  return parseFence(markdown);
}

describe("the human table", () => {
  it("names the component, the body and the viewport", () => {
    const markdown = exported([storedComment()]);
    expect(markdown).toContain("`DashboardHeader`");
    expect(markdown).toContain("spacing under the heading");
    expect(markdown).toContain("1440×900");
  });

  it("falls back down the anchor for the Where column", () => {
    const bySource = exported([storedComment({ anchor: { source: "src/App.tsx:4:3" } })]);
    const bySelector = exported([storedComment({ anchor: { selector: "main > h1" } })]);
    const byNothing = exported([storedComment({ anchor: {} })]);

    expect(bySource).toContain("`src/App.tsx:4:3`");
    expect(bySelector).toContain("`main > h1`");
    expect(byNothing).toContain("| — |");
  });

  it("escapes a pipe so one comment cannot break the table", () => {
    const markdown = exported([storedComment({ body: "the a | b divider is off" })]);
    const row = markdown.split("\n").find((line) => line.includes("divider"))!;

    expect(row).toContain("a \\| b");
    expect(row.split(/(?<!\\)\|/)).toHaveLength(6);
  });

  it("keeps a multi-line comment on one row", () => {
    const markdown = exported([storedComment({ body: "first line\nsecond line" })]);
    expect(markdown).toContain("first line<br>second line");
  });

  it("numbers the rows from one", () => {
    const markdown = exported([storedComment({ id: "a" }), storedComment({ id: "b" })]);
    expect(markdown).toContain("| 1 |");
    expect(markdown).toContain("| 2 |");
  });
});

describe("screenshots", () => {
  it("links a hosted screenshot", () => {
    const markdown = exported([storedComment()], {
      screenshots: new Map([["c_1", "https://shots.example.com/a.png"]]),
    });
    expect(markdown).toContain("[view](https://shots.example.com/a.png)");
  });

  it("drops a data: URL, which a pull-request body strips anyway", () => {
    const markdown = exported([storedComment()], {
      screenshots: new Map([["c_1", "data:image/png;base64,AAAA"]]),
    });
    expect(markdown).not.toContain("data:image");
    expect(markdown).not.toContain("Shot");
  });

  it("leaves the column out entirely when no comment has one", () => {
    expect(exported([storedComment()])).not.toContain("Shot");
  });
});

describe("the fence", () => {
  it("is visible, never an HTML comment", () => {
    const markdown = exported([storedComment()]);
    expect(markdown).toContain("```maple");
    expect(markdown).not.toContain("<!--");
  });

  it("round-trips through parseFence", () => {
    const comment = storedComment();
    const parsed = fenceOf(exported([comment]));

    expect(parsed?.version).toBe(FENCE_VERSION);
    expect(parsed?.branch).toBe(BRANCH);
    expect(parsed?.comments).toEqual([comment]);
  });

  it("is byte-identical for an unchanged comment set", () => {
    const comments = [storedComment({ id: "b" }), storedComment({ id: "a" })];
    expect(exported(comments)).toBe(exported(comments));
  });

  it("reports nothing when the body has no fence", () => {
    expect(parseFence("just a comment")).toBeUndefined();
  });

  it("refuses a version it cannot read rather than half-reading it", () => {
    const body = '```maple\n{ "version": 2, "branch": "x", "comments": [] }\n```';
    expect(() => parseFence(body)).toThrow(UnsupportedFenceError);
  });

  it("hands back unknown fields so a rewrite does not drop them", () => {
    const body = '```maple\n{ "version": 1, "branch": "x", "comments": [], "extra": 7 }\n```';
    expect(parseFence(body)?.raw["extra"]).toBe(7);
  });
});

describe("the byte budget", () => {
  const long = "word ".repeat(60);

  function many(count: number): Comment[] {
    return Array.from({ length: count }, (_, index) =>
      storedComment({
        id: `c_${index}`,
        body: long,
        anchor: {
          component: "DashboardHeader",
          selector: "main > header > h1:nth-of-type(1)",
          quote: { exact: long, prefix: long, suffix: long },
        },
      }),
    );
  }

  it("stays under budget for a normal set, shedding nothing", () => {
    const result = exportMarkdown([storedComment()], { branch: BRANCH });
    expect(result.bytes).toBeLessThan(8192);
    expect(result.reduced).toEqual([]);
    expect(result.overBudget).toBe(false);
  });

  it("sheds quote context first", () => {
    const result = exportMarkdown(many(6), { branch: BRANCH });
    expect(result.reduced[0]).toBe("quote-context");
    expect(result.bytes).toBeLessThanOrEqual(8192);
  });

  it("sheds in a fixed order as the set grows", () => {
    const result = exportMarkdown(many(40), { branch: BRANCH });
    expect(result.reduced).toEqual(["quote-context", "selector", "context", "quote"]);
  });

  it("never drops a comment, and says so when it cannot fit", () => {
    const result = exportMarkdown(many(400), { branch: BRANCH });
    expect(result.overBudget).toBe(true);
    expect(parseFence(result.markdown)?.comments).toHaveLength(400);
  });

  it("keeps what a fix cannot be verified without, even at the smallest size", () => {
    const result = exportMarkdown(many(400), { branch: BRANCH });
    const [first] = parseFence(result.markdown)!.comments;

    expect(first?.context.viewportWidth).toBe(1440);
    expect(first?.context.colorScheme).toBe("light");
    expect(first?.body).toContain("word");
    expect(first?.anchor.component).toBe("DashboardHeader");
  });
});
