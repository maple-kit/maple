/**
 * The SDK route: one handler the overlay talks to, mounted on the host
 * application's own origin.
 *
 * Same-origin is the whole design. It means no `connect-src` addition, and it
 * means the application's session cookie is already on the request, so
 * identity is a five-line function rather than a second login.
 */

import { MapleStoreError } from "../errors.js";

import type { IdentityConnector, ListQuery, StoreConnector } from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type { Comment, CommentStatus, NewComment } from "../types.js";

/** What the route is wired to. */
export interface RouteOptions {
  /** Where comments live. The only required connector. */
  readonly store: StoreConnector;
  /** Resolves the reviewer from the request. Without one, comments are guest-written. */
  readonly identity?: IdentityConnector;
  /** Defaults to `/api/maple`. */
  readonly basePath?: string;
  /** Where failures are reported. Silent when absent. */
  readonly logger?: Logger;
}

/** The default mount point, matched by the Vite plugin and the Next codemod. */
export const DEFAULT_BASE_PATH = "/api/maple";

const STATUSES = new Set<string>(["open", "resolved", "needs_reverify", "orphaned"]);

/** Creates the request handler. Web-standard in, web-standard out. */
export function createMapleHandler(options: RouteOptions): (request: Request) => Promise<Response> {
  const base = options.basePath ?? DEFAULT_BASE_PATH;

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : undefined;
    if (route === undefined) return json({ error: "Not found" }, 404);

    try {
      return await dispatch(options, request, route, url);
    } catch (error) {
      return failure(options.logger, error);
    }
  };
}

async function dispatch(
  options: RouteOptions,
  request: Request,
  route: string,
  url: URL,
): Promise<Response> {
  if (route === "/comments" && request.method === "GET") return listComments(options, url);
  if (route === "/comments" && request.method === "POST") return appendComment(options, request);
  if (route === "/me" && request.method === "GET") return whoAmI(options, request);

  const status = /^\/comments\/([^/]+)$/.exec(route);
  if (status && request.method === "PATCH") return setStatus(options, request, status[1]!);
  if (status || route === "/comments" || route === "/me") {
    return json({ error: "Method not allowed" }, 405);
  }
  return json({ error: "Not found" }, 404);
}

async function listComments(options: RouteOptions, url: URL): Promise<Response> {
  const branch = url.searchParams.get("branch");
  if (!branch) return json({ error: "A branch is required" }, 400);

  const page = await options.store.list(queryFrom(url, branch));
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
 * The author comes from the identity connector, never from the request body.
 * A client that could name its own author could name someone else's.
 */
async function appendComment(options: RouteOptions, request: Request): Promise<Response> {
  const draft = await readJson(request);
  if (!isDraft(draft)) return json({ error: "A branch and a body are required" }, 400);

  const user = await options.identity?.resolveUser(identityRequest(request));
  const comment: NewComment = {
    ...draft,
    author: user
      ? { id: user.id, name: user.name, provenance: "server" }
      : { id: "guest", name: "Guest", provenance: "guest" },
  };

  return json(await options.store.append(comment), 201);
}

async function setStatus(options: RouteOptions, request: Request, id: string): Promise<Response> {
  const change = await readJson(request);
  const status = (change as { status?: unknown } | undefined)?.status;
  if (typeof status !== "string" || !STATUSES.has(status)) {
    return json({ error: "An known status is required" }, 400);
  }

  const update = options.store.setStatus?.bind(options.store);
  if (!update) return json({ error: "This store cannot change a status" }, 501);

  return json(await update(id, status as CommentStatus), 200);
}

async function whoAmI(options: RouteOptions, request: Request): Promise<Response> {
  const user = await options.identity?.resolveUser(identityRequest(request));
  return json({ user: user ?? null }, 200);
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

function isDraft(value: unknown): value is Omit<NewComment, "author"> & { author?: never } {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<Comment>;
  return typeof draft.branch === "string" && typeof draft.body === "string" && !!draft.anchor;
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
