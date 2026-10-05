/**
 * The page's own API, answered from `data.ts`: what a real app would fetch.
 * `/ld/…` stands in for LaunchDarkly's flag poll, so the example needs no key.
 * The Vite servers and the deployed Worker answer from this one table.
 */

import { AUDIT, LD_FLAGS, ROWS } from "../src/app/data.js";

/** A status and a JSON body; a null body is a 204. */
export interface Answer {
  readonly status: 200 | 204;
  readonly body: unknown;
}

const API: Readonly<Record<string, unknown>> = {
  "GET /api/reviews": { items: ROWS, total: ROWS.length, nextCursor: null },
  "GET /api/session": { name: "Ada", tint: 0, role: "owner", permissions: ["settings.write"] },
  "GET /api/audit": { items: AUDIT },
  "POST /api/settings": null,
};

const LD_POLL = /^\/ld\/sdk\/evalx\/[^/]+\/contexts\/[^/]+$/;

/** The answer for a request, or undefined when the page's API has none. */
export function answerFor(method: string, path: string): Answer | undefined {
  const body = method === "GET" && LD_POLL.test(path) ? LD_FLAGS : API[`${method} ${path}`];
  if (body === undefined) return undefined;
  return body === null ? { status: 204, body: null } : { status: 200, body };
}
