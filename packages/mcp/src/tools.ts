/**
 * The tools Maple exposes to an agent.
 *
 * Phase 0 fixes the names, the arguments and the result shapes. The transport
 * is added with the server itself; nothing here depends on an MCP SDK, so the
 * contract can be reviewed and tested on its own.
 */

import type { Comment, CommentStatus } from "@maplekit/core";

/** Every tool name Maple registers. */
export const TOOL_NAMES = [
  "list_comments",
  "wait_for_comments",
  "resolve_comment",
  "get_comment_context",
] as const;

/** One of Maple's tool names. */
export type ToolName = (typeof TOOL_NAMES)[number];

/** How a wait ended. A timeout is a normal result, never an error. */
export type WaitStatus = "comments" | "timeout";

/** What `wait_for_comments` returns. */
export interface WaitResult {
  readonly status: WaitStatus;
  /** Pass back on the next call to continue from here. */
  readonly cursor: string;
  readonly comments: readonly Comment[];
}

/** Arguments to `list_comments`. */
export interface ListCommentsArgs {
  readonly branch: string;
  readonly statuses?: readonly CommentStatus[];
  readonly cursor?: string;
}

/** Arguments to `wait_for_comments`. */
export interface WaitForCommentsArgs {
  readonly branch: string;
  readonly cursor?: string;
  /** Clamped into Maple's budget; see `clampWaitMs`. */
  readonly timeoutMs?: number;
}

/** Arguments to `resolve_comment`. */
export interface ResolveCommentArgs {
  readonly id: string;
  /** Commit the agent believes resolves the comment. */
  readonly sha: string;
  readonly note?: string;
}

/** A tool as it is advertised to a client. */
export interface ToolDescriptor {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  /** True when the tool only reads, so a client may run it without prompting. */
  readonly readOnly: boolean;
}

/** The advertised tool list, in the order a client should see it. */
export const TOOLS: readonly ToolDescriptor[] = [
  {
    name: "list_comments",
    title: "List review comments",
    description: "Return the review comments on a branch, newest first.",
    readOnly: true,
  },
  {
    name: "wait_for_comments",
    title: "Wait for review comments",
    description:
      "Block until a new comment arrives or the wait elapses. Returns status " +
      '"timeout" rather than failing when nothing arrives.',
    readOnly: true,
  },
  {
    name: "resolve_comment",
    title: "Resolve a review comment",
    description: "Mark a comment resolved, recording the commit that addressed it.",
    readOnly: false,
  },
  {
    name: "get_comment_context",
    title: "Get a comment's context",
    description:
      "Return everything needed to act on one comment: anchor, viewport, " +
      "surrounding markup and any replay link.",
    readOnly: true,
  },
];

/** Finds a tool descriptor by name. */
export function findTool(name: string): ToolDescriptor | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
