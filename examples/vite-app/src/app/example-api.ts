/**
 * The page's own API, answered from `data.ts`: what a real app would fetch.
 * `/ld/…` stands in for LaunchDarkly's flag poll, so the example needs no key.
 *
 * Plain data and no Node, so the Vite servers and the deployed Worker answer
 * the same calls from one table.
 */

import { AUDIT, LD_FLAGS, ROWS } from "./data.js";

/** What an API call answers: a JSON body, or none (204). */
export type ApiAnswer = { readonly body: unknown } | { readonly empty: true };

const API: Readonly<Record<string, unknown>> = {
  "GET /api/reviews": { items: ROWS, total: ROWS.length, nextCursor: null },
  "GET /api/session": { name: "Ada", tint: 0, role: "owner", permissions: ["settings.write"] },
  "GET /api/audit": { items: AUDIT },
  "POST /api/settings": null,
};

const LD_POLL = /^\/ld\/sdk\/evalx\/[^/]+\/contexts\/[^/]+$/;

/** The answer for a call, or undefined when the example does not serve it. */
export function answerExample(method: string, path: string): ApiAnswer | undefined {
  const body = method === "GET" && LD_POLL.test(path) ? LD_FLAGS : API[`${method} ${path}`];
  if (body === undefined) return undefined;
  return body === null ? { empty: true } : { body };
}
