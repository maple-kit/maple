import { describe, expect, it } from "vitest";

import {
  exportMarkdown,
  FENCE_VERSION,
  parseFence,
  UnsupportedFenceError,
} from "../src/export/index.js";
import { SAMPLE_CONTEXT, storedComment } from "../src/testing/fixtures.js";

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

describe("the chrome around it", () => {
  it("carries the wordmark inline in the line above the table, with a dark form", () => {
    const [first] = exported([storedComment()]).split("\n");

    expect(first).toContain("Comment written by Reviewer via <picture>");
    expect(first).toContain("(prefers-color-scheme: dark)");
    expect(first).toContain('alt="Maple"');
    expect(first?.endsWith("</picture>:")).toBe(true);
  });

  it("keeps the picture on one line, since a blank line would end the HTML block", () => {
    const first = exported([storedComment()]).split("\n")[0]!;
    expect(first.split("<picture>")).toHaveLength(2);
  });

  it("names every author once, in the order they first appear", () => {
    const by = (name: string, id: string): Comment =>
      storedComment({ id, author: { id: name, name, provenance: "server" } });
    const markdown = exported([by("Ada", "a"), by("Grace", "b"), by("Ada", "c")]);

    expect(markdown).toContain("Comments written by Ada and Grace via <picture>");
  });

  it("keeps the wordmark when nobody signed, rather than crediting nobody", () => {
    const markdown = exported([
      storedComment({ author: { id: "u", name: " ", provenance: "guest" } }),
    ]);

    expect(markdown).toContain("Comment collected via <picture>");
    expect(markdown).not.toContain("written by");
  });

  it("says what the fence is for, directly above it", () => {
    const markdown = exported([storedComment()]);
    const lead = markdown.indexOf("The full comment details in markdown, to copy into an agent:");

    expect(lead).toBeGreaterThan(markdown.indexOf("| # |"));
    expect(lead).toBeLessThan(markdown.indexOf("```maple"));
  });

  it("closes with the preview, the commit and a link back to the repository", () => {
    const markdown = exported([storedComment({ commit: "a1b2c3d4e5f6a7b8" })]);
    expect(
      markdown.endsWith(
        "<sub><code>preview.example.com @ a1b2c3d</code> · " +
          'powered by <a href="https://github.com/maple-kit/maple">Maple</a></sub>',
      ),
    ).toBe(true);
  });

  it("stamps the preview alone when the comment carries no commit", () => {
    const markdown = exported([storedComment()]);
    expect(markdown).toContain("<code>preview.example.com</code> · powered by");
  });

  it("drops a stamp it cannot read rather than printing a broken one", () => {
    const context = { ...SAMPLE_CONTEXT, url: "not a url" };
    const markdown = exported([storedComment({ context })]);

    expect(markdown).not.toContain("<code>");
    expect(markdown).toContain("<sub>powered by");
  });

  it("costs the fence none of its budget", () => {
    const result = exportMarkdown([storedComment()], { branch: BRANCH, budget: 8192 });
    expect(result.bytes).toBeLessThan(result.markdown.length);
    expect(result.overBudget).toBe(false);
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

describe("replies, which are reserved rather than built", () => {
  it("carries parentId through the fence unchanged", () => {
    const comment = storedComment({ parentId: "c_0" });
    expect(fenceOf(exported([comment]))?.comments).toEqual([comment]);
  });

  it("never sheds parentId, so a reply could not be orphaned by the budget", () => {
    const long = "word ".repeat(60);
    const comments = Array.from({ length: 400 }, (_, index) =>
      storedComment({ id: `c_${index}`, body: long, parentId: "c_0" }),
    );
    const result = exportMarkdown(comments, { branch: BRANCH });

    expect(result.overBudget).toBe(true);
    expect(parseFence(result.markdown)?.comments.every((c) => c.parentId === "c_0")).toBe(true);
  });

  it("keeps the caller's order rather than inferring one from createdAt", () => {
    const older = storedComment({ id: "b", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = storedComment({ id: "a", createdAt: "2026-06-01T00:00:00.000Z" });

    expect(fenceOf(exported([newer, older]))?.comments.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("writes exactly one row per comment", () => {
    const markdown = exported([storedComment({ id: "a" }), storedComment({ id: "b" })]);
    const rows = markdown.split("\n").filter((line) => /^\| \d+ \|/.test(line));

    expect(rows).toHaveLength(2);
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
    expect(result.reduced).toEqual(["quote-context", "regions", "selector", "context", "quote"]);
  });

  it("keeps a resolution at the smallest size, so the gate can still read it", () => {
    const resolution = {
      sha: "9f1c0de",
      note: "Matched the padding.",
      at: "2026-02-03T09:15:00.000Z",
    };
    const comments = many(400).map((comment) => ({ ...comment, resolution }));
    const result = exportMarkdown(comments, { branch: BRANCH });

    expect(result.reduced).toEqual(["quote-context", "regions", "selector", "context", "quote"]);
    expect(parseFence(result.markdown)?.comments[0]?.resolution).toEqual(resolution);
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
    expect(first?.context.contentWidth).toBe(1020);
    expect(first?.context.colorScheme).toBe("light");
    expect(first?.body).toContain("word");
    expect(first?.anchor.component).toBe("DashboardHeader");
  });

  it("sheds regions before it touches the selector", () => {
    const regions = Array.from({ length: 30 }, (_, index) => ({
      role: "complementary",
      label: `Panel ${index}`,
      width: 420,
    }));
    const fat = Array.from({ length: 4 }, (_, index) =>
      storedComment({
        id: `c_${index}`,
        anchor: { component: "DashboardHeader", selector: "main > header > h1" },
        context: { ...SAMPLE_CONTEXT, regions },
      }),
    );

    const result = exportMarkdown(fat, { branch: BRANCH });
    const [first] = parseFence(result.markdown)!.comments;

    expect(result.reduced).toContain("regions");
    expect(result.reduced).not.toContain("selector");
    expect(first?.context.regions).toBeUndefined();
    expect(first?.anchor.selector).toBe("main > header > h1");
  });

  it("never sheds the content width, even at the smallest size", () => {
    const result = exportMarkdown(many(400), { branch: BRANCH });
    const [first] = parseFence(result.markdown)!.comments;

    expect(result.reduced).toContain("context");
    expect(first?.context.contentWidth).toBe(1020);
  });

  it("carries the label and the commit, which no reduction sheds", () => {
    const stamped = storedComment({ label: "web-482", commit: "a1b2c3d4e5f6a7b8" });
    const result = exportMarkdown([stamped, ...many(400)], { branch: BRANCH });
    const [first] = parseFence(result.markdown)!.comments;

    expect(result.reduced).toContain("context");
    expect(first?.label).toBe("web-482");
    expect(first?.commit).toBe("a1b2c3d4e5f6a7b8");
  });
});

describe("a summary, with no fence", () => {
  it("returns the chrome and the table, and no fence", () => {
    const result = exportMarkdown([storedComment({ status: "open" })], {
      branch: BRANCH,
      fence: false,
    });

    expect(result.markdown).toContain("| # | Where | Comment | Viewport |");
    expect(result.markdown).toContain("via <picture>");
    expect(result.markdown).toContain("powered by");
    expect(result.markdown).not.toContain("```maple");
    expect(result.markdown).not.toContain("copy into an agent");
    expect(parseFence(result.markdown)).toBeUndefined();
  });

  it("costs no budget, because there is nothing to fit", () => {
    const wordy = Array.from({ length: 400 }, (_, index) =>
      storedComment({ id: `c_${String(index)}`, body: "x".repeat(200) }),
    );

    expect(exportMarkdown(wordy, { branch: BRANCH, fence: false })).toMatchObject({
      bytes: 0,
      reduced: [],
      overBudget: false,
    });
  });
});
