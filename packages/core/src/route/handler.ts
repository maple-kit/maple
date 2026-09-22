/**
 * The SDK route: one handler the overlay talks to, mounted on the host
 * application's own origin.
 *
 * Same-origin is the whole design. It means no `connect-src` addition, and it
 * means the application's session cookie is already on the request, so
 * identity is a five-line function rather than a second login.
 */

import { MapleStoreError } from "../errors.js";
import { fnv1a32 } from "../lib/fnv1a.js";
import { handleApprovals } from "./approvals.js";
import { createAssist } from "./assist.js";
import { endLink, finishLink, githubState, linkFailure, startLink } from "./auth.js";
import { gateFor, publishGate } from "./gate.js";

import type {
  GateConnector,
  IdentityConnector,
  IdentityRequest,
  ListQuery,
  MediaConnector,
  StoreConnector,
} from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type {
  Comment,
  CommentAuthor,
  CommentResolution,
  CommentStatus,
  MapleUser,
  NewComment,
} from "../types.js";
import type { Assist, AssistOptions } from "./assist.js";
import type { GitHubAuthOptions } from "./auth.js";
import type { GateResolver } from "./gate.js";

/**
 * Chooses the store for one request. The shape a per-reviewer credential
 * needs: the token differs per person, so the connector holding it does too.
 * Null means this reviewer has nowhere to write yet.
 */
export type StoreResolver = (
  request: IdentityRequest,
) => StoreConnector | null | Promise<StoreConnector | null>;

/**
 * Chooses the media connector for one request, for the same reason a store is
 * chosen per request: the credential can be the reviewer's.
 */
export type MediaResolver = (
  request: IdentityRequest,
) => MediaConnector | null | Promise<MediaConnector | null>;

/** What the route is wired to. */
export interface RouteOptions {
  /** Where comments live. One connector, or one chosen per request. */
  readonly store: StoreConnector | StoreResolver;
  /**
   * Where screenshots go. Without one the overlay says a screenshot has
   * nowhere to be kept, rather than offering to take one and dropping it.
   */
  readonly media?: MediaConnector | MediaResolver;
  /** Resolves the reviewer from the request. Without one, comments are guest-written. */
  readonly identity?: IdentityConnector;
  /**
   * Where the merge verdict goes after a status changes. Without one a resolve
   * is recorded and nothing is reported.
   */
  readonly gate?: GateConnector | GateResolver;
  /**
   * Signs a reviewer in to GitHub with Device Flow. Absent, the three
   * `/auth/github` endpoints answer 404 and `/me` reports no link state.
   */
  readonly githubAuth?: GitHubAuthOptions;
  /**
   * Judges the comment being typed. Absent, `/assist` answers 404 and nothing
   * about the composer changes: the whole tier is off unless switched on.
   */
  readonly assist?: AssistOptions;
  /**
   * True when a quiet surface still needs somebody to say they looked. Needs a
   * store that keeps approvals and an identity to name who left one.
   */
  readonly requireApproval?: boolean;
  /** Defaults to `/api/maple`. */
  readonly basePath?: string;
  /** Where failures are reported. Silent when absent. */
  readonly logger?: Logger;
}

/** The default mount point, matched by the Vite plugin and the Next codemod. */
export const DEFAULT_BASE_PATH = "/api/maple";

const STATUSES = new Set<string>(["open", "resolved", "needs_reverify", "orphaned"]);

/**
 * Shape only: the client describes its own page here, as it already does the
 * branch and the URL, and a store finds the commit or says it cannot.
 */
const COMMIT = /^[0-9a-f]{7,40}$/;

/** The ten OKLCH reviewer hues a mark can be drawn in. */
const COLOR_SLOTS = 10;

/** Creates the request handler. Web-standard in, web-standard out. */
/** Everything built once, when the handler is, rather than per request. */
interface Mount {
  readonly options: RouteOptions;
  /** Undefined when no classifier is configured: the whole tier is off. */
  readonly assist: Assist | undefined;
}

export function createMapleHandler(options: RouteOptions): (request: Request) => Promise<Response> {
  const base = options.basePath ?? DEFAULT_BASE_PATH;
  const mount: Mount = {
    options,
    assist: options.assist === undefined ? undefined : createAssist(options.assist),
  };

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : undefined;
    if (route === undefined) return json({ error: "Not found" }, 404);

    try {
      return await dispatch(mount, request, route, url);
    } catch (error) {
      return failure(options.logger, error);
    }
  };
}

async function dispatch(
  mount: Mount,
  request: Request,
  route: string,
  url: URL,
): Promise<Response> {
  const { options } = mount;
  if (route === "/assist") return judge(mount, request);
  if (route === "/auth/github") return link(options, request);
  if (route === "/media" || route.startsWith("/media/")) return media(options, request, route, url);
  if (route === "/approvals" || route.startsWith("/approvals/")) {
    return approvals(options, request, route, url);
  }

  const one = /^\/comments\/([^/]+)$/.exec(route);
  if (route !== "/comments" && route !== "/me" && !one) return json({ error: "Not found" }, 404);

  const allowed = methodAllowed(route, one !== null, request.method);
  if (!allowed) return json({ error: "Method not allowed" }, 405);
  if (route === "/me") return whoAmI(mount, request);

  const store = await storeFor(options, request);
  if (!store) return json({ error: "This reviewer has no store to write to" }, 401);

  if (one) return setStatus(options, store, request, one[1]!);
  return request.method === "GET"
    ? listComments(store, url)
    : appendComment(options, store, request);
}

/**
 * The approval arm. It resolves its own reviewer as well as its store: an
 * approval is the one write whose author decides whether it is accepted.
 */
async function approvals(
  options: RouteOptions,
  request: Request,
  route: string,
  url: URL,
): Promise<Response> {
  const store = await storeFor(options, request);
  if (!store) return json({ error: "This reviewer has no store to write to" }, 401);

  const id = route === "/approvals" ? undefined : decodeURIComponent(route.slice(11));
  const user = (await options.identity?.resolveUser(identityRequest(request))) ?? null;
  const answer = await handleApprovals({ store, user, authorFor }, request, id, url);

  const branch = request.method === "GET" ? undefined : await branchOf(answer);
  if (branch !== undefined) await reportGate(options, store, request, branch);
  return answer;
}

/**
 * The branch a write was about, off the answer rather than the request: a
 * `DELETE` names an id. Undefined when nothing was written, so no publish.
 */
async function branchOf(answer: Response): Promise<string | undefined> {
  if (answer.status !== 200 && answer.status !== 201) return undefined;

  const body = (await answer.clone().json()) as { branch?: unknown };
  return typeof body.branch === "string" ? body.branch : undefined;
}

/** `POST /media` takes the bytes and hands back the reference a comment keeps;
 * `GET /media/{key}` redirects to wherever the connector put them. */
async function media(
  options: RouteOptions,
  request: Request,
  route: string,
  url: URL,
): Promise<Response> {
  const connector = await mediaFor(options, request);
  if (!connector) return json({ error: "This deployment keeps no screenshots" }, 404);

  const key = route === "/media" ? undefined : decodeURIComponent(route.slice("/media/".length));
  if (key === undefined) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    return putBlob(connector, request);
  }

  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  return readBlob(connector, key, url);
}

/** The content type is the request's, so nothing has to be parsed out of bytes. */
async function putBlob(connector: MediaConnector, request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return json({ error: "An image is required" }, 415);

  const data = new Uint8Array(await request.arrayBuffer());
  if (data.byteLength === 0) return json({ error: "An image is required" }, 400);

  return json(await connector.putBlob({ data, contentType }), 201);
}

/** A redirect, not a proxy: a connector's URL is signed and short-lived, and
 * streaming the bytes would put every screenshot on the application's budget. */
async function readBlob(connector: MediaConnector, key: string, url: URL): Promise<Response> {
  const contentType = url.searchParams.get("type") ?? "application/octet-stream";
  const found = await connector.getUrl({ connector: connector.name, key, contentType });
  const inline = decoded(found);
  if (inline) return inline;

  return new Response(null, {
    status: 302,
    headers: { location: found, "cache-control": "no-store" },
  });
}

/** A browser refuses to follow a redirect to a data URL, so a connector that
 * answers with one is served rather than pointed at. Only a dev one does. */
function decoded(found: string): Response | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(found);
  if (!match) return undefined;

  const binary = atob(match[2]!);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": match[1]!, "cache-control": "no-store" },
  });
}

/** A plain connector is used as it is; a resolver is asked, every request. */
async function mediaFor(options: RouteOptions, request: Request): Promise<MediaConnector | null> {
  const chosen = options.media;
  if (chosen === undefined) return null;
  return typeof chosen === "function" ? chosen(identityRequest(request)) : chosen;
}

/**
 * Starting, finishing and forgetting a GitHub link. Neither the device code
 * nor the token reaches the browser: both travel in cookies this route sets.
 */
async function link(options: RouteOptions, request: Request): Promise<Response> {
  const auth = options.githubAuth;
  if (!auth) return json({ error: "Not found" }, 404);

  const headers = Object.fromEntries(request.headers);
  try {
    if (request.method === "POST") return await startLink(auth);
    if (request.method === "PATCH") return await finishLink(auth, headers);
    if (request.method === "DELETE") return endLink(auth);
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return linkFailure(error) ?? failure(options.logger, error);
  }
}

/** Checked before the store is resolved: a wrong method is not a credential problem. */
function methodAllowed(route: string, one: boolean, method: string): boolean {
  if (one) return method === "PATCH";
  if (route === "/me") return method === "GET";
  return method === "GET" || method === "POST";
}

/** A plain connector is used as it is; a resolver is asked, every request. */
async function storeFor(options: RouteOptions, request: Request): Promise<StoreConnector | null> {
  const { store } = options;
  return typeof store === "function" ? store(identityRequest(request)) : store;
}

async function listComments(store: StoreConnector, url: URL): Promise<Response> {
  const branch = url.searchParams.get("branch");
  if (!branch) return json({ error: "A branch is required" }, 400);

  const page = await store.list(queryFrom(url, branch));
  return json(page, 200);
}

function queryFrom(url: URL, branch: string): ListQuery {
  const cursor = url.searchParams.get("cursor");
  const limit = url.searchParams.get("limit");
  const statuses = url.searchParams.getAll("status").filter((value) => STATUSES.has(value));

  return {
    branch,
    ...(cursor === null ? {} : { cursor }),
    ...(limit === null ? {} : { limit: Number(limit) }),
    ...(statuses.length === 0 ? {} : { statuses: statuses as CommentStatus[] }),
  };
}

/**
 * The author and their colour slot are built here, never read off the body: a
 * client that can choose its own author can choose someone else's.
 */
async function appendComment(
  options: RouteOptions,
  store: StoreConnector,
  request: Request,
): Promise<Response> {
  const posted = await readJson(request);
  if (!isDraft(posted)) return json({ error: "A branch and a body are required" }, 400);

  const draft = withoutResolution(posted);

  const user = await options.identity?.resolveUser(identityRequest(request));
  const comment: NewComment = {
    ...draft,
    author: user ? authorFor(user) : { id: "guest", name: "Guest", provenance: "guest" },
  };

  return json(await store.append(comment), 201);
}

/** A resolved reviewer, as a comment or an approval records them. */
function authorFor(user: MapleUser): CommentAuthor {
  return {
    id: user.id,
    name: user.name,
    provenance: "server",
    colorSlot: colorSlotFor(user.id),
    ...(user.avatarUrl === undefined ? {} : { avatarUrl: user.avatarUrl }),
  };
}

/**
 * A hash of the id rather than a per-page counter: two reviewers on two
 * machines would otherwise be handed the same hue and read as one person.
 */
function colorSlotFor(id: string): number {
  return fnv1a32(id) % COLOR_SLOTS;
}

async function setStatus(
  options: RouteOptions,
  store: StoreConnector,
  request: Request,
  id: string,
): Promise<Response> {
  const change = (await readJson(request)) as
    { status?: unknown; resolution?: unknown } | undefined;
  const status = change?.status;
  if (typeof status !== "string" || !STATUSES.has(status)) {
    return json({ error: "An known status is required" }, 400);
  }

  const claimed = change?.resolution;
  if (claimed !== undefined && !isResolutionClaim(claimed)) {
    return json({ error: "A resolution needs a sha" }, 400);
  }

  const update = store.setStatus?.bind(store);
  if (!update) return json({ error: "This store cannot change a status" }, 501);

  const resolution = claimed === undefined ? undefined : stamp(claimed);
  const updated = await update(id, status as CommentStatus, resolution);

  await reportGate(options, store, request, updated.branch);
  return json(updated, 200);
}

/**
 * Awaited, not left floating: a serverless runtime may stop the process as the
 * response is written, and `publishGate` never throws.
 */
async function reportGate(
  options: RouteOptions,
  store: StoreConnector,
  request: Request,
  branch: string,
): Promise<void> {
  const gate = await gateFor(options.gate, identityRequest(request));
  if (!gate) return;

  const context = {
    store,
    gate,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.requireApproval === undefined ? {} : { requireApproval: options.requireApproval }),
  };
  await publishGate(context, branch, new URL(request.url).origin);
}

/** What a client may claim about a resolution: the commit, and optionally why. */
function isResolutionClaim(value: unknown): value is { sha: string; note?: string } {
  if (typeof value !== "object" || value === null) return false;
  const claim = value as { sha?: unknown; note?: unknown };
  return (
    typeof claim.sha === "string" &&
    claim.sha.length > 0 &&
    (claim.note === undefined || typeof claim.note === "string")
  );
}

/**
 * `at` is stamped here, never taken from the body, for the same reason the
 * author is: a client that can date its own resolution can backdate one.
 */
function stamp(claim: { sha: string; note?: string }): CommentResolution {
  return {
    sha: claim.sha,
    ...(claim.note === undefined ? {} : { note: claim.note }),
    at: new Date().toISOString(),
  };
}

async function whoAmI(mount: Mount, request: Request): Promise<Response> {
  const { assist, options } = mount;
  const user = await options.identity?.resolveUser(identityRequest(request));
  const auth = options.githubAuth;
  const github = auth ? await githubState(auth, Object.fromEntries(request.headers)) : undefined;
  const media = (await mediaFor(options, request)) !== null;

  return json(
    {
      user: user ?? null,
      media,
      approval: { required: options.requireApproval === true },
      ...(github === undefined ? {} : { github }),
      ...(assist === undefined ? {} : { assist: { pillars: assist.pillars } }),
    },
    200,
  );
}

/**
 * `/me` says whether the gate wants an approval, never whether one could be
 * left: answering that means resolving a store. `GET /approvals` answers that.
 */

/**
 * The comment being typed, judged. The session it is counted against is the
 * reviewer's own id, so one person's typing cannot spend another's budget.
 */
async function judge(mount: Mount, request: Request): Promise<Response> {
  const { assist, options } = mount;
  if (!assist) return json({ error: "Not found" }, 404);

  const user = await options.identity?.resolveUser(identityRequest(request));
  return assist.respond(request, user?.id ?? "anonymous", options.logger);
}

/** The identity connector sees headers and a URL, and nothing else. */
function identityRequest(request: Request): { headers: Record<string, string>; url: string } {
  return { headers: Object.fromEntries(request.headers), url: request.url };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * A comment cannot arrive already resolved, and dropping it here beats widening
 * `NewComment`'s `Omit`, which would hide the field from stores too.
 */
function withoutResolution<T extends { resolution?: unknown }>(draft: T): Omit<T, "resolution"> {
  const copy = { ...draft };
  delete copy.resolution;
  return copy;
}

function isDraft(value: unknown): value is Omit<NewComment, "author"> & { author?: never } {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<Comment>;
  return (
    typeof draft.branch === "string" &&
    typeof draft.body === "string" &&
    !!draft.anchor &&
    (draft.label === undefined || typeof draft.label === "string") &&
    (draft.commit === undefined || COMMIT.test(draft.commit))
  );
}

/**
 * A connector's message goes to the log, not to the browser. It can name a
 * repository, a rate limit or a token that is about to expire.
 */
function failure(logger: Logger | undefined, error: unknown): Response {
  const known = error instanceof MapleStoreError || error instanceof RangeError;
  logger?.error(
    "The Maple route failed.",
    error instanceof Error ? error : new Error(String(error)),
  );

  return known
    ? json({ error: "The request was not valid for this store" }, 400)
    : json({ error: "Something went wrong" }, 500);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
