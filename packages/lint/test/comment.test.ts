import { SAMPLE_CONTEXT } from "@maple-kit/core/testing";
import { describe, expect, it } from "vitest";

import {
  commentsForRun,
  findingComment,
  findingCommentId,
  findingComments,
  LINT_AUTHOR,
} from "../src/comment.js";

import type { Finding } from "@maple-kit/core/connectors";

const NOW = "2026-01-01T12:00:00.000Z";
const OPTIONS = { branch: "feature/x", context: SAMPLE_CONTEXT, now: NOW };

const BARE: Finding = {
  rule: "maple/rendered-color-token",
  tier: "rendered",
  severity: "error",
  message: "The text colour #abcdef is not a token.",
  anchor: { source: "src/app/page.tsx:10:4", selector: "main > p:nth-of-type(2)" },
};

const DOCS = "https://example.test/docs#rendered-color-token";

/** A finding as a rule emits one, with the link to the rule it came from. */
function finding(over: Partial<Finding> = {}): Finding {
  return { ...BARE, url: DOCS, ...over };
}

describe("findingComment", () => {
  it("carries the finding's anchor through unchanged, which is what pins it", () => {
    expect(findingComment(finding(), OPTIONS).anchor).toEqual(finding().anchor);
  });

  it("reads as the message, then the rule that says so", () => {
    const { body } = findingComment(finding(), OPTIONS);
    expect(body).toContain("The text colour #abcdef is not a token.");
    expect(body).toContain("maple/rendered-color-token");
    expect(body).toContain(DOCS);
  });

  it("names the rule without a link when the finding has none", () => {
    expect(findingComment(BARE, OPTIONS).body).toContain("maple/rendered-color-token");
    expect(findingComment(BARE, OPTIONS).body).not.toContain("https://");
  });

  it("is open, from the lint author, on the branch it was given", () => {
    const comment = findingComment(finding(), OPTIONS);
    expect(comment.status).toBe("open");
    expect(comment.author).toEqual(LINT_AUTHOR);
    expect(comment.branch).toBe("feature/x");
    expect(comment.createdAt).toBe(NOW);
  });

  it("says the author is not a person", () => {
    expect(LINT_AUTHOR.provenance).toBe("server");
    expect(LINT_AUTHOR.name).toBe("Maple lint");
  });

  it("carries a commit only when the caller knows one", () => {
    expect(findingComment(finding(), OPTIONS).commit).toBeUndefined();
    expect(findingComment(finding(), { ...OPTIONS, commit: "abc123" }).commit).toBe("abc123");
  });

  it("takes an author the host supplies instead", () => {
    const author = { id: "ci", name: "CI", provenance: "server" } as const;
    expect(findingComment(finding(), { ...OPTIONS, author }).author).toEqual(author);
  });
});

describe("findingCommentId", () => {
  it("is the same for the same finding on the same branch, so a rerun appends nothing", () => {
    expect(findingCommentId(finding(), "feature/x")).toBe(findingCommentId(finding(), "feature/x"));
  });

  it.each([
    ["the rule", { rule: "maple/rendered-contrast" }],
    ["the place", { anchor: { source: "src/app/other.tsx:1:1" } }],
    ["the message", { message: "Something else." }],
  ])("differs when %s differs", (_what, over) => {
    expect(findingCommentId(finding(over), "feature/x")).not.toBe(
      findingCommentId(finding(), "feature/x"),
    );
  });

  it("differs between branches, because a comment belongs to one", () => {
    expect(findingCommentId(finding(), "feature/x")).not.toBe(
      findingCommentId(finding(), "feature/y"),
    );
  });

  it("counts from the most durable rung the page supplied", () => {
    const keyed = finding({ anchor: { key: "save-button", selector: "a" } });
    const moved = finding({ anchor: { key: "save-button", selector: "b" } });
    expect(findingCommentId(keyed, "feature/x")).toBe(findingCommentId(moved, "feature/x"));
  });
});

describe("findingComments", () => {
  it("keeps the order they were found in", () => {
    const findings = [finding(), finding({ message: "Second." })];
    expect(findingComments(findings, OPTIONS).map((comment) => comment.body)).toEqual([
      findingComment(findings[0]!, OPTIONS).body,
      findingComment(findings[1]!, OPTIONS).body,
    ]);
  });

  it("is empty for a clean run", () => {
    expect(findingComments([], OPTIONS)).toEqual([]);
  });
});

describe("commentsForRun", () => {
  it("gives each comment the context its finding was seen in", () => {
    const phone = { ...SAMPLE_CONTEXT, viewportWidth: 375, viewportHeight: 812 };
    const run = {
      findings: [finding(), finding({ message: "Second." })],
      contexts: [phone, SAMPLE_CONTEXT],
      context: SAMPLE_CONTEXT,
      judgedErrors: [],
    };
    const comments = commentsForRun(run, { branch: "feature/x", now: NOW });
    expect(comments[0]!.context.viewportWidth).toBe(375);
    expect(comments[1]!.context.viewportWidth).toBe(SAMPLE_CONTEXT.viewportWidth);
  });

  it("falls back to the run's context when one is missing", () => {
    const run = { findings: [finding()], contexts: [], context: SAMPLE_CONTEXT, judgedErrors: [] };
    expect(commentsForRun(run, { branch: "feature/x", now: NOW })[0]!.context).toEqual(
      SAMPLE_CONTEXT,
    );
  });
});
