/**
 * The Claude Code Stop hook: an agent does not finish while comments are open.
 *
 * MCP has no way for a server to interrupt a client, so the loop is closed
 * from the other side. The hook is called when the agent believes it is done,
 * looks at the open comments, and either lets it stop or hands the list back.
 */

import type { Comment } from "@maple-kit/core";

/** What Claude Code sends a Stop hook. Only these two fields are read. */
export interface StopHookInput {
  /** True when this stop is itself the result of a previous block. */
  readonly stop_hook_active?: boolean;
  /** How many times this hook has already blocked. Maple counts its own. */
  readonly blocks?: number;
}

/** What a Stop hook may answer. */
export interface StopHookDecision {
  readonly decision?: "block";
  readonly reason?: string;
}

/**
 * How many times Maple will block before letting the agent stop anyway.
 *
 * A hook that can block forever is a hung session, and a human watching an
 * agent loop has no way out of one.
 */
export const MAX_BLOCKS = 8;

/** Decides whether the agent may finish. */
export function decideStop(open: readonly Comment[], input: StopHookInput = {}): StopHookDecision {
  if (open.length === 0) return {};

  const blocks = input.blocks ?? 0;
  if (blocks >= MAX_BLOCKS) {
    return {
      reason:
        `${String(open.length)} Maple comment(s) are still open after ${String(MAX_BLOCKS)} attempts. ` +
        "Letting the session end; say what is left rather than resolving them silently.",
    };
  }

  return { decision: "block", reason: worklist(open) };
}

function worklist(open: readonly Comment[]): string {
  const lines = open.map((comment, index) => `${String(index + 1)}. ${describe(comment)}`);
  return [
    `${String(open.length)} Maple review comment(s) are still open. Address or reply to each, then resolve it with resolve_comment.`,
    ...lines,
  ].join("\n");
}

function describe(comment: Comment): string {
  const where = comment.anchor.source ?? comment.anchor.component ?? comment.anchor.selector ?? "?";
  const orphaned = comment.status === "orphaned" ? " (orphaned: the location is stale)" : "";
  return `[${comment.id}] ${where}${orphaned} — ${first(comment.body)}`;
}

function first(body: string): string {
  const line = body.split("\n")[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
