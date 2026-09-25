/**
 * The REST codec: one request is one call, keyed by method and path pattern.
 *
 * It is the fallback codec. Any HTTP request another codec does not claim is
 * REST, and only a JSON response is read, so a script or an image is never
 * recorded and never reshaped.
 */

import { isData, keptHeaders } from "./codec.js";

import type { Answer, Call, Codec } from "./codec.js";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const ULID = /^[\dA-HJKMNP-TV-Z]{26}$/i;
const HEX = /^[\da-f]{16,}$/i;
const DIGITS = /^\d+$/;

/** Whether one path segment is an identifier rather than a name. */
function isIdentifier(segment: string): boolean {
  if (DIGITS.test(segment) || UUID.test(segment) || ULID.test(segment)) return true;
  return HEX.test(segment) && /\d/.test(segment);
}

/**
 * A path with its identifiers collapsed to `:id`, so `/projects/42` and
 * `/projects/43` are one call and one route.
 */
export function pathPattern(pathname: string): string {
  const segments = pathname.split("/").map((segment) => {
    if (segment === "") return segment;
    return isIdentifier(decodeURIComponent(segment)) ? ":id" : segment;
  });
  const pattern = segments.join("/");
  return pattern.length > 1 && pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
}

/** The key a recipe names a REST call by: `rest:GET /api/projects/:id`. */
export function restKey(method: string, url: string | URL): string {
  return `rest:${method.toUpperCase()} ${pathPattern(new URL(url).pathname)}`;
}

/** Whether a content type is JSON, `application/problem+json` included. */
export function isJson(type: string | null): boolean {
  const essence = (type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return essence === "application/json" || essence.endsWith("+json");
}

const MESSAGES = { error: "Internal Server Error", forbidden: "Forbidden" } as const;
const STATUSES = { error: 500, forbidden: 403 } as const;

async function read(response: Response): Promise<readonly Answer[] | undefined> {
  if (!isJson(response.headers.get("content-type"))) return undefined;
  const text = await response.text();
  try {
    return [{ kind: "data", status: response.status, body: JSON.parse(text) as unknown }];
  } catch {
    return undefined;
  }
}

function join(_: readonly Call[], answers: readonly Answer[], real?: Response): Response {
  const answer = answers[0];
  const headers = keptHeaders(real, "application/json");
  if (answer === undefined || answer.kind === "failure") {
    const state = answer?.state ?? "error";
    const body = JSON.stringify({ message: MESSAGES[state] });
    return new Response(body, { status: STATUSES[state], headers });
  }
  const status = isData(answer) || real === undefined ? answer.status : real.status;
  return new Response(JSON.stringify(answer.body), { status, headers });
}

/** The REST codec. Put it last: it claims every request that reaches it. */
export const restCodec: Codec = {
  name: "rest",
  split: (request) => Promise.resolve([{ key: restKey(request.method, request.url) }]),
  read: (response) => read(response),
  join,
};
