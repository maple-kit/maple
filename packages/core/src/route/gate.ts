/**
 * Publishing the merge gate from the route, so a resolve clears the check
 * without a new push.
 *
 * The action already publishes at push time. That is not enough on its own: a
 * reviewer who resolves the last comment would wait for a commit nobody needs
 * to make, which is the failure that got Chromatic's gate deleted from
 * people's rulesets. `docs/gate.md` is the design.
 */

import { supports } from "../connectors/capabilities.js";
import { decideGate } from "../gate/decide.js";

import type { GateConnector, IdentityRequest, StoreConnector } from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type { Approval, Comment } from "../types.js";

/**
 * Chooses the gate for one request, for the same reason a store is chosen per
 * request. Null means this deployment publishes no gate.
 */
export type GateResolver = (
  request: IdentityRequest,
) => GateConnector | null | Promise<GateConnector | null>;

/** How many comments are read back before the verdict stops being exact. */
const PAGE = 100;

/**
 * Re-reads the surface and publishes a verdict for its head commit.
 *
 * Never throws. The status change has already happened by the time this runs,
 * and a gate that fails a resolve is worse than a gate that is briefly stale:
 * the reviewer did the thing, and the check is a report about it.
 */
export async function publishGate(
  context: GateContext,
  branch: string,
  reviewUrl?: string,
): Promise<void> {
  try {
    await publish(context, branch, reviewUrl);
  } catch (error) {
    context.logger?.error(
      "Maple could not publish the merge gate; the comment's status was saved.",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/** What a publish needs, gathered once by the caller. */
export interface GateContext {
  readonly store: StoreConnector;
  readonly gate: GateConnector;
  readonly logger?: Logger;
  /**
   * True when a quiet surface still needs somebody to say they looked at it.
   * `docs/gate.md` covers why that is off by default.
   */
  readonly requireApproval?: boolean;
}

async function publish(context: GateContext, branch: string, reviewUrl?: string): Promise<void> {
  const sha = await headOf(context, branch);
  if (sha === undefined) return;

  const approvals = await approvalsOn(context, branch);
  const verdict = decideGate(await commentsOn(context.store, branch), {
    statusTracked: supports(context.store, "setStatus"),
    commit: sha,
    ...(context.requireApproval === undefined ? {} : { requireApproval: context.requireApproval }),
    ...(approvals === undefined ? {} : { approvals }),
  });

  await context.gate.publish({
    branch,
    sha,
    verdict,
    ...(reviewUrl === undefined ? {} : { reviewUrl }),
  });
}

/**
 * Undefined is a store with nowhere to keep one, which the verdict reports as
 * neutral. Asked for even when none is required: the summary names who signed.
 */
async function approvalsOn(
  context: GateContext,
  branch: string,
): Promise<readonly Approval[] | undefined> {
  const ask = context.store.approvals?.bind(context.store);
  return ask ? await ask(branch) : undefined;
}

/**
 * A store that cannot name a commit means no publish: a verdict on a guessed
 * commit reads as an answer, which is worse than silence.
 */
async function headOf(context: GateContext, branch: string): Promise<string | undefined> {
  const ask = context.store.head?.bind(context.store);
  if (!ask) {
    context.logger?.warn(
      `Store "${context.store.name}" cannot name a head commit, so no gate was published.`,
    );
    return undefined;
  }

  const sha = await ask(branch);
  if (sha === undefined) {
    context.logger?.warn(`No head commit for "${branch}", so no gate was published.`);
  }

  return sha;
}

/**
 * Every comment on the surface, not one page: a count that stopped at the
 * first page would clear a gate that holds.
 */
async function commentsOn(store: StoreConnector, branch: string): Promise<Comment[]> {
  const comments: Comment[] = [];
  let cursor: string | undefined;

  do {
    const page = await store.list({
      branch,
      limit: PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    comments.push(...page.comments);
    cursor = page.cursor;
  } while (cursor !== undefined && comments.length < PAGE * PAGE);

  return comments;
}

/** A plain connector is used as it is; a resolver is asked, every request. */
export async function gateFor(
  chosen: GateConnector | GateResolver | undefined,
  request: IdentityRequest,
): Promise<GateConnector | null> {
  if (chosen === undefined) return null;
  return typeof chosen === "function" ? await chosen(request) : chosen;
}
