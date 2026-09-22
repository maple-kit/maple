/**
 * What each tool actually does.
 *
 * Kept apart from the transport so the behaviour can be tested without an MCP
 * client, and so the waiting tool's timing is exercised in milliseconds rather
 * than in minutes.
 */

import { publishGate } from "@maple-kit/core";

import { clampWaitMs } from "./timeout.js";

import type {
  ListCommentsArgs,
  ResolveCommentArgs,
  WaitForCommentsArgs,
  WaitResult,
} from "./tools.js";
import type { Comment, GateConnector, Logger, StoreConnector } from "@maple-kit/core";

/** How the handlers reach the comments. */
export interface HandlerOptions {
  readonly store: StoreConnector;
  /**
   * Where the verdict goes after the agent resolves something. Without one the
   * check keeps holding until a push, which is what the route's publish avoids.
   */
  readonly gate?: GateConnector;
  /** True when the gate is held until somebody approves the preview. */
  readonly requireApproval?: boolean;
  /** Where a failed publish is reported. Silent when absent. */
  readonly logger?: Logger;
  /** How long to leave between polls while waiting. Defaults to two seconds. */
  readonly pollIntervalMs?: number;
  /** Injected in tests, so a wait does not really wait. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Injected in tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Everything one comment needs to be acted on. */
export interface CommentContext {
  readonly comment: Comment;
  /**
   * The rungs of the anchor, most durable first, as a reader should try them.
   * Empty when the comment orphaned.
   */
  readonly anchors: readonly string[];
  /** The conditions the comment was written under, in one line. */
  readonly conditions: string;
}

/** The tool implementations. */
export interface ToolHandlers {
  listComments(args: ListCommentsArgs): Promise<readonly Comment[]>;
  waitForComments(args: WaitForCommentsArgs): Promise<WaitResult>;
  resolveComment(args: ResolveCommentArgs): Promise<Comment>;
  getCommentContext(args: { id: string; branch: string }): Promise<CommentContext>;
}

const DEFAULT_POLL_MS = 2_000;
const EPOCH = new Date(0).toISOString();

/** Builds the handlers over a store. */
export function createToolHandlers(options: HandlerOptions): ToolHandlers {
  const wait = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const interval = options.pollIntervalMs ?? DEFAULT_POLL_MS;

  async function all(args: ListCommentsArgs): Promise<Comment[]> {
    const collected: Comment[] = [];
    let cursor = args.cursor;

    do {
      const page = await options.store.list({
        branch: args.branch,
        ...(cursor === undefined ? {} : { cursor }),
        ...(args.statuses === undefined ? {} : { statuses: args.statuses }),
      });
      collected.push(...page.comments);
      cursor = page.cursor;
    } while (cursor !== undefined);

    return collected.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return {
    listComments: (args) => all(args),

    /**
     * Drains what is already there before blocking, so an agent that starts
     * after a reviewer does not wait for a second comment to see the first.
     */
    async waitForComments(args): Promise<WaitResult> {
      const budget = clampWaitMs(args.timeoutMs);
      const deadline = now() + budget;
      let since = args.cursor ?? EPOCH;

      for (;;) {
        const fresh = (await all({ branch: args.branch })).filter(
          (comment) => comment.createdAt > since,
        );
        if (fresh.length > 0) {
          since = fresh[0]?.createdAt ?? since;
          return { status: "comments", cursor: since, comments: fresh };
        }
        if (now() >= deadline) return { status: "timeout", cursor: since, comments: [] };

        await wait(Math.min(interval, Math.max(0, deadline - now())));
      }
    },

    /**
     * The commit and the note travel with the status. A store that cannot keep
     * them still records the status rather than refusing the call.
     */
    async resolveComment(args): Promise<Comment> {
      const setStatus = options.store.setStatus?.bind(options.store);
      if (!setStatus) {
        throw new Error(
          `The ${options.store.name} store cannot change a status; resolve the comment where it lives.`,
        );
      }
      const updated = await setStatus(args.id, "resolved", {
        sha: args.sha,
        ...(args.note === undefined ? {} : { note: args.note }),
        at: new Date(now()).toISOString(),
      });

      await report(options, updated.branch);
      return updated;
    },

    async getCommentContext(args): Promise<CommentContext> {
      const comment = (await all({ branch: args.branch })).find((one) => one.id === args.id);
      if (!comment) throw new Error(`No comment ${args.id} on ${args.branch}.`);

      return { comment, anchors: anchorsOf(comment), conditions: conditionsOf(comment) };
    },
  };
}

/**
 * Says what the resolve means for the merge. Never throws: the status is
 * already recorded, and a gate that fails a resolve is worse than a stale one.
 */
async function report(options: HandlerOptions, branch: string): Promise<void> {
  if (!options.gate) return;

  await publishGate(
    {
      store: options.store,
      gate: options.gate,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.requireApproval === undefined
        ? {}
        : { requireApproval: options.requireApproval }),
    },
    branch,
  );
}

/** The cascade as a reader should walk it: stop at the first rung present. */
function anchorsOf(comment: Comment): string[] {
  if (comment.status === "orphaned") return [];

  const { anchor } = comment;
  return [
    anchor.source && `source ${anchor.source}`,
    anchor.component && `component ${anchor.component}`,
    anchor.quote && `quote ${JSON.stringify(anchor.quote.exact)}`,
    anchor.selector && `selector ${anchor.selector}`,
  ].filter((rung): rung is string => typeof rung === "string");
}

/** Most Maple comments are conditional on these, so they are never optional here. */
function conditionsOf(comment: Comment): string {
  const { context } = comment;
  return [
    `${String(context.viewportWidth)}×${String(context.viewportHeight)}`,
    `${String(context.devicePixelRatio)}× density`,
    context.colorScheme,
    context.url,
  ].join(" · ");
}
