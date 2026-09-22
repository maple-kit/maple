/**
 * The calls the reviewer interface makes, and nothing else.
 *
 * Same-origin by construction: the route is mounted on the host application's
 * own origin, so the session cookie is already on the request and Maple adds
 * nothing to `connect-src`. Failures surface as one plain `Error` subclass
 * carrying the status, because a binding has to be able to tell a 401 from a
 * 500 without importing anything of ours.
 */

import type { Pillar } from "../connectors/types.js";
import type { AssistAnswer } from "../route/assist.js";
import type { Approval, Comment, CommentStatus, MapleUser, MediaRef } from "../types.js";
import type { PostedComment, ResolutionClaim } from "./types.js";

/** The default mount point, matched by the route, the Vite plugin and the codemod. */
export const DEFAULT_BASE_PATH = "/api/maple";

/** A page beyond this many is a store misbehaving, not a long review. */
const MAX_PAGES = 20;

/** A call to the Maple route that did not come back with what was asked for. */
export class MapleRequestError extends Error {
  override readonly name = "MapleRequestError";

  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/** How the transport reaches the route. */
export interface TransportOptions {
  readonly branch: string;
  /** Absolute or relative. Defaults to {@link DEFAULT_BASE_PATH}. */
  readonly basePath?: string;
  /** Injectable so a test drives the route without reaching for a global. */
  readonly fetch?: typeof globalThis.fetch;
}

/** What `POST /auth/github` hands back for the reviewer to act on. */
export interface LinkStart {
  readonly userCode: string;
  readonly verificationUri: string;
  /** Milliseconds since the epoch. */
  readonly expiresAt: number;
  /** Seconds GitHub asks to be left between attempts. */
  readonly interval: number;
}

/** One exchange attempt. `pending` is the flow working, not failing. */
export type LinkAttempt =
  | { readonly status: "pending"; readonly interval: number }
  | { readonly status: "linked"; readonly login?: string };

/** Who the route says this reviewer is, and whether they have linked. */
export interface Identity {
  readonly user: MapleUser | null;
  /** Absent when the route serves no GitHub sign-in at all. */
  readonly github?: { readonly linked: boolean; readonly login?: string };
  /** Whether this deployment has anywhere to keep a screenshot. */
  readonly media?: boolean;
  /** Absent when nothing judges a comment. The pillars a card renders. */
  readonly assist?: { readonly pillars: readonly Pillar[] };
  /** Whether the merge gate is held until somebody approves the preview. */
  readonly approval?: { readonly required: boolean };
}

/** The route, as the controller sees it. */
export interface Transport {
  /** Every comment on the branch, following the store's cursor to the end. */
  list(signal?: AbortSignal): Promise<readonly Comment[]>;
  append(comment: PostedComment): Promise<Comment>;
  /** Several at once, in one request, so one notification goes out. */
  appendMany(comments: readonly PostedComment[]): Promise<readonly Comment[]>;
  setStatus(id: string, status: CommentStatus, resolution?: ResolutionClaim): Promise<Comment>;
  /** Null user when the host application has no session for this request. */
  me(): Promise<Identity>;
  /** Judges the comment as it stands. Aborts with the signal, never retries. */
  assist(body: string, signal: AbortSignal): Promise<AssistAnswer>;
  /** Puts an image where the media connector keeps them. */
  putMedia(blob: Blob, contentType: string): Promise<MediaRef>;
  /** A URL for an `img`, which the route redirects from. Builds no request. */
  mediaUrl(ref: MediaRef): string;
  /** Every approval on the branch, or undefined where the store keeps none. */
  approvals(): Promise<readonly Approval[] | undefined>;
  /** Records that this reviewer looked. The route names the commit. */
  approve(note?: string): Promise<Approval>;
  /** Takes back an approval this reviewer left. */
  unapprove(id: string): Promise<void>;
  /** Asks GitHub for a code to show the reviewer. */
  linkStart(): Promise<LinkStart>;
  /** One exchange attempt. The caller does the waiting between them. */
  linkAttempt(): Promise<LinkAttempt>;
  /** Forgets the token. GitHub keeps the authorisation until it is revoked. */
  linkEnd(): Promise<void>;
}

/** Opens the transport. Touches no global until a method is called. */
export function createTransport(options: TransportOptions): Transport {
  const call = requester(options);

  return {
    list: (signal) => listAll(call, options.branch, signal),
    append: (comment) =>
      call<Comment>("/comments", { method: "POST", body: JSON.stringify(comment) }),
    appendMany: async (comments) => {
      const answer = await call<{ comments?: Comment[] }>("/comments", {
        method: "POST",
        body: JSON.stringify(comments),
      });
      return answer.comments ?? [];
    },
    setStatus: (id, status, resolution) =>
      call<Comment>(`/comments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(resolution === undefined ? {} : { resolution }) }),
      }),
    me: () => call<Identity>("/me", {}),
    assist: (body, signal) =>
      call<AssistAnswer>("/assist", { method: "POST", body: JSON.stringify({ body }), signal }),
    putMedia: (blob, contentType) =>
      call<MediaRef>("/media", {
        method: "POST",
        body: blob,
        headers: { "content-type": contentType },
      }),
    mediaUrl: (ref) => mediaUrl(options.basePath ?? DEFAULT_BASE_PATH, ref),
    approvals: async () => {
      const query = new URLSearchParams({ branch: options.branch });
      try {
        const answer = await call<{ approvals?: Approval[] }>(`/approvals?${query.toString()}`, {});
        return answer.approvals ?? [];
      } catch (error) {
        if (error instanceof MapleRequestError && error.status === 501) return undefined;
        throw error;
      }
    },
    approve: (note) =>
      call<Approval>("/approvals", {
        method: "POST",
        body: JSON.stringify({ branch: options.branch, ...(note === undefined ? {} : { note }) }),
      }),
    unapprove: async (id) => {
      const query = new URLSearchParams({ branch: options.branch });
      await call<unknown>(`/approvals/${encodeURIComponent(id)}?${query.toString()}`, {
        method: "DELETE",
      });
    },
    linkStart: () => call<LinkStart>("/auth/github", { method: "POST" }),
    linkAttempt: () => call<LinkAttempt>("/auth/github", { method: "PATCH" }),
    linkEnd: async () => {
      await call<unknown>("/auth/github", { method: "DELETE" });
    },
  };
}

/**
 * The key is in the path and the type is a query, because `getUrl` takes a
 * whole `MediaRef` and the connector is the route's own.
 */
function mediaUrl(base: string, ref: MediaRef): string {
  const query = new URLSearchParams({ type: ref.contentType });
  return `${base}/media/${encodeURIComponent(ref.key)}?${query.toString()}`;
}

/** Binds the base path and the fetch to use, so no call site repeats either. */
function requester(options: TransportOptions): Requester {
  const base = options.basePath ?? DEFAULT_BASE_PATH;
  const send = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  return async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await send(base + path, withDefaults(init));
    const body: unknown = await readJson(response);
    if (!response.ok) throw new MapleRequestError(response.status, path, messageOf(body));
    return body as T;
  };
}

type Requester = <T>(path: string, init: RequestInit) => Promise<T>;

/**
 * A store hands back one page at a time. The inventory shows a branch, not a
 * page, so the cursor is followed here rather than leaked into every binding.
 */
async function listAll(
  call: Requester,
  branch: string,
  signal: AbortSignal | undefined,
): Promise<readonly Comment[]> {
  const comments: Comment[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ branch, ...(cursor === undefined ? {} : { cursor }) });
    const init: RequestInit = signal === undefined ? {} : { signal };
    const answer = await call<{ comments?: Comment[]; cursor?: string }>(
      `/comments?${query.toString()}`,
      init,
    );

    comments.push(...(answer.comments ?? []));
    cursor = answer.cursor;
    if (cursor === undefined) break;
  }
  return comments;
}

/** Same-origin credentials: the point of mounting the route on the host. */
function withDefaults(init: RequestInit): RequestInit {
  return {
    credentials: "same-origin",
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function messageOf(body: unknown): string {
  const named = (body as { error?: unknown } | undefined)?.error;
  return typeof named === "string" ? named : "The Maple route did not answer.";
}
