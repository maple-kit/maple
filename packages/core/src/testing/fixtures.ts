import type { Comment, CommentContext, NewComment } from "../types.js";

/** A plausible reviewer environment, used wherever a test needs one. */
export const SAMPLE_CONTEXT: CommentContext = {
  url: "https://preview.example.com/dashboard",
  viewportWidth: 1440,
  viewportHeight: 900,
  devicePixelRatio: 2,
  colorScheme: "light",
  locale: "en-GB",
  breakpoint: "lg",
};

/** Builds a comment ready to append, with `overrides` merged over the defaults. */
export function sampleComment(overrides: Partial<NewComment> = {}): NewComment {
  return {
    branch: "feature/x",
    body: "The spacing under the heading is inconsistent with the card above.",
    createdAt: new Date("2026-01-01T12:00:00.000Z").toISOString(),
    author: { id: "u_1", name: "Reviewer", provenance: "server" },
    anchor: { component: "DashboardHeader", selector: "main > header > h1" },
    context: SAMPLE_CONTEXT,
    ...overrides,
  };
}

/** Builds a stored comment, for tests that need one without a store. */
export function storedComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c_1",
    status: "open",
    ...sampleComment(),
    ...overrides,
  };
}
