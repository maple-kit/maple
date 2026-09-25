/**
 * A small REST API for a page to fetch, and a count of what reached it.
 *
 * The count is the point: a mock that should have answered on its own and
 * forwarded anyway is invisible in the response it returns.
 */

import { http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

export const API = "https://preview.example/api";

export const PROJECTS = {
  items: [
    { id: 1, name: "Atlas", status: "active" },
    { id: 2, name: "Borealis", status: "paused" },
  ],
  total: 2,
  nextCursor: "c2",
  hasMore: true,
};

export const ME = { id: "u_1", name: "Reviewer", plan: "team" };

/** Who the reviewer is, for a recipe's `as`: a role, and permissions by name. */
export const SESSION = {
  user: { name: "Reviewer", role: "owner" },
  permissions: ["project:delete", "billing:write"],
};

/** A fake API, plus what it was asked. */
export interface ApiFake {
  readonly handlers: RequestHandler[];
  /** `METHOD path` of every request that reached it, oldest first. */
  readonly reached: readonly string[];
  /** Answers every request to `path` with a 500 until reset. */
  fail(path: string): void;
  reset(): void;
}

export function createApiFake(): ApiFake {
  const reached: string[] = [];
  const failing = new Set<string>();

  const seen = (request: Request) => {
    const { pathname } = new URL(request.url);
    reached.push(`${request.method} ${pathname}`);
    return failing.has(pathname)
      ? HttpResponse.json({ message: "upstream timed out" }, { status: 500 })
      : undefined;
  };

  const handlers: RequestHandler[] = [
    http.get(`${API}/projects`, ({ request }) => seen(request) ?? HttpResponse.json(PROJECTS)),
    http.get(
      `${API}/projects/:id`,
      ({ request }) => seen(request) ?? HttpResponse.json(PROJECTS.items[0]),
    ),
    http.get(
      `${API}/me`,
      ({ request }) => seen(request) ?? HttpResponse.json(ME, { headers: { "x-trace": "t1" } }),
    ),
    http.get(`${API}/session`, ({ request }) => seen(request) ?? HttpResponse.json(SESSION)),
    http.get(`${API}/audit`, ({ request }) => seen(request) ?? HttpResponse.json({ items: [] })),
    http.delete(
      `${API}/projects/:id`,
      ({ request }) => seen(request) ?? new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${API}/count`, ({ request }) => seen(request) ?? HttpResponse.json(7)),
    http.get(`${API}/page`, ({ request }) => seen(request) ?? HttpResponse.html("<p>hi</p>")),
    http.post(
      `${API}/projects`,
      ({ request }) => seen(request) ?? HttpResponse.json({ id: 3 }, { status: 201 }),
    ),
  ];

  return {
    handlers,
    reached,
    fail: (path) => failing.add(path),
    reset() {
      reached.length = 0;
      failing.clear();
    },
  };
}
