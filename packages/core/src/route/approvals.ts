/**
 * Approving a preview: the other half of the gate.
 *
 * A surface with no comments on it cannot be told apart from one nobody
 * opened, so a check that clears on both reports green for a review that never
 * happened. An approval is the record that somebody looked. `docs/gate.md` has
 * the decision; this file is the three endpoints behind it.
 */

import type { CommentStore } from "../store.js";
import type { CommentAuthor, MapleUser, NewApproval } from "../types.js";

/** What the approval endpoints need, gathered by the dispatcher. */
export interface ApprovalContext {
  readonly store: CommentStore;
  /** Null when the request carries no session. A guest cannot sign anything. */
  readonly user: MapleUser | null;
  /** Builds the author record, so the colour slot is derived in one place. */
  authorFor(user: MapleUser): CommentAuthor;
}

/** The two methods a gate needs together; one without the other keeps nothing. */
export function keepsApprovals(store: CommentStore): boolean {
  return store.capabilities.approvals && store.capabilities.approve;
}

/**
 * `GET /approvals`, `POST /approvals` and `DELETE /approvals/{id}`. The branch
 * comes from the query or the body; the commit never does — `store.head` names
 * it, for the reason `docs/gate.md` gives about the browser choosing a target.
 */
export async function handleApprovals(
  context: ApprovalContext,
  request: Request,
  id: string | undefined,
  url: URL,
): Promise<Response> {
  const { store } = context;
  if (!keepsApprovals(store)) return json({ error: "This store keeps no approvals" }, 501);

  if (id !== undefined) {
    if (request.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
    return await withdraw(context, store, id, url);
  }
  if (request.method === "GET") return await listApprovals(store, url);
  if (request.method === "POST") return await approve(context, store, request);
  return json({ error: "Method not allowed" }, 405);
}

async function listApprovals(store: CommentStore, url: URL): Promise<Response> {
  const branch = url.searchParams.get("branch");
  if (!branch) return json({ error: "A branch is required" }, 400);

  return json({ approvals: (await store.approvals(branch)) ?? [] }, 200);
}

/**
 * An approval nobody can be named for is not one: it would let anyone holding
 * the preview URL clear a required check as "Guest". So an identity is needed.
 */
async function approve(
  context: ApprovalContext,
  store: CommentStore,
  request: Request,
): Promise<Response> {
  const { user } = context;
  if (!user) return json({ error: "Sign in before you can approve this preview" }, 401);

  const body = (await readJson(request)) as { branch?: unknown; note?: unknown } | undefined;
  const branch = body?.branch;
  if (typeof branch !== "string" || branch === "") {
    return json({ error: "A branch is required" }, 400);
  }

  const commit = await store.head(branch);
  if (commit === undefined) {
    return json({ error: "Nothing here can name the commit this preview is serving" }, 409);
  }

  const note = typeof body?.note === "string" && body.note !== "" ? body.note : undefined;
  const approval: NewApproval = {
    branch,
    commit,
    author: context.authorFor(user),
    at: new Date().toISOString(),
    ...(note === undefined ? {} : { note }),
  };
  const recorded = await store.approve(approval);
  if (!recorded) return json({ error: "This store keeps no approvals" }, 501);
  return json(recorded, 201);
}

/**
 * Only the reviewer who approved may take it back. The branch is a query
 * parameter because `approvals` lists by branch and an id does not say which.
 */
async function withdraw(
  context: ApprovalContext,
  store: CommentStore,
  id: string,
  url: URL,
): Promise<Response> {
  const { user } = context;
  if (!user) return json({ error: "Sign in before you can withdraw an approval" }, 401);
  if (!store.capabilities.unapprove) {
    return json({ error: "This store cannot withdraw an approval" }, 501);
  }

  const branch = url.searchParams.get("branch");
  if (!branch) return json({ error: "A branch is required" }, 400);

  const approvals = (await store.approvals(branch)) ?? [];
  const found = approvals.find((one) => one.id === id && one.author.id === user.id);
  if (!found) return json({ error: "No approval of yours with that id" }, 404);

  await store.unapprove(id);
  return json({ branch: found.branch }, 200);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
