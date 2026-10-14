/**
 * What the route knows about the preview this page is served from.
 *
 * A host that does not stamp a branch into its build asks the route instead:
 * `GET {base}/context` names the surface from the request alone. This reads
 * that answer and nothing else; the route owns how it was worked out.
 */

import { DEFAULT_BASE_PATH, MapleRequestError } from "./transport.js";

import type { ContextBody, ContextReason } from "../route/context.js";

/** Every reason the route gives; the record keeps this in step with its type. */
const REASONS: Readonly<Record<ContextReason, true>> = {
  "sign-in": true,
  none: true,
  ambiguous: true,
  "no-access": true,
  unavailable: true,
  unconfigured: true,
};

/** Where the route is, and the fetch to reach it with. */
export interface ReadContextOptions {
  /** Defaults to `/api/maple`. */
  readonly basePath?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly signal?: AbortSignal;
}

/** A string the route sent, or undefined for anything else, null and empty included. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** A reason this client does not know is a newer route's, and reads as unavailable. */
function reasonOf(value: unknown): ContextReason | null {
  if (typeof value !== "string") return null;
  return value in REASONS ? (value as ContextReason) : "unavailable";
}

function parsed(body: unknown): ContextBody {
  const raw = (body ?? {}) as { [K in keyof ContextBody]?: unknown };
  const key = text(raw.key);
  const branch = text(raw.branch) ?? key;
  if (key === undefined || branch === undefined) {
    throw new MapleRequestError(200, "/context", "The Maple route sent an unreadable context.");
  }

  return {
    preview: text(raw.preview) ?? "",
    key,
    branch,
    label: text(raw.label) ?? key,
    commit: text(raw.commit) ?? null,
    pullRequest: typeof raw.pullRequest === "number" ? raw.pullRequest : null,
    pullRequestUrl: text(raw.pullRequestUrl) ?? null,
    resolved: raw.resolved === true,
    reason: reasonOf(raw.reason),
  };
}

/**
 * Asks the route which preview this is. Null on a 404, which is the route
 * saying this deploy is not a preview; any other failure throws.
 */
export async function readContext(options: ReadContextOptions = {}): Promise<ContextBody | null> {
  const send = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const response = await send(`${options.basePath ?? DEFAULT_BASE_PATH}/context`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (response.status === 404) return null;

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const named = (body as { error?: unknown } | undefined)?.error;
    const message = typeof named === "string" ? named : "The Maple route did not answer.";
    throw new MapleRequestError(response.status, "/context", message);
  }
  return parsed(body);
}
