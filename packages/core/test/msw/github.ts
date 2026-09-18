/**
 * A small fake of the three GitHub endpoints the store connector uses.
 *
 * It is a fake rather than a set of fixed responses because the contract suite
 * appends and then reads back: a handler that always returns the same page
 * cannot express read-your-writes, which is the property this connector
 * claims.
 */

import { http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

const API = "https://api.github.com";
const LOGIN = "https://github.com";

interface StoredComment {
  id: number;
  body: string;
}

/** A fake repository, with its pull requests and their comments. */
export interface GitHubFake {
  readonly handlers: RequestHandler[];
  /** Forgets every comment, so one test cannot see another's. */
  reset(): void;
  /** Comments currently on a pull request, for asserting on what was written. */
  commentsOn(pull: number): readonly StoredComment[];
}

/**
 * Creates the fake. Every branch resolves to a pull request except those
 * starting with `no-pull/`, which resolve to none.
 */
export function createGitHubFake(owner = "maple-kit", repo = "app"): GitHubFake {
  const comments = new Map<number, StoredComment[]>();
  let nextId = 1000;

  const commentsFor = (pull: number): StoredComment[] => {
    const existing = comments.get(pull);
    if (existing) return existing;
    const created: StoredComment[] = [];
    comments.set(pull, created);
    return created;
  };

  const handlers: RequestHandler[] = [
    http.get(`${API}/repos/${owner}/${repo}/pulls`, ({ request }) => {
      const head = new URL(request.url).searchParams.get("head") ?? "";
      const branch = head.slice(head.indexOf(":") + 1);
      if (branch.startsWith("no-pull/")) return HttpResponse.json([]);
      return HttpResponse.json([{ number: pullFor(branch) }]);
    }),

    http.get(`${API}/repos/${owner}/${repo}/issues/:pull/comments`, ({ params, request }) => {
      const url = new URL(request.url);
      const pull = Number(params["pull"]);
      const perPage = Number(url.searchParams.get("per_page") ?? "100");
      const page = Number(url.searchParams.get("page") ?? "1");

      const all = commentsFor(pull);
      const start = (page - 1) * perPage;
      const slice = all.slice(start, start + perPage);
      const headers = start + slice.length < all.length ? { link: nextLink(url, page) } : undefined;

      return HttpResponse.json(slice, headers ? { headers } : undefined);
    }),

    http.post(
      `${API}/repos/${owner}/${repo}/issues/:pull/comments`,
      async ({ params, request }) => {
        const pull = Number(params["pull"]);
        const { body } = (await request.json()) as { body: string };
        nextId += 1;
        const created = { id: nextId, body };

        commentsFor(pull).push(created);
        return HttpResponse.json(created, { status: 201 });
      },
    ),

    http.get(`${API}/repos/${owner}/${repo}/issues/comments/:id`, ({ params }) => {
      const found = find(comments, Number(params["id"]));
      if (!found) return HttpResponse.json({ message: "Not Found" }, { status: 404 });
      return HttpResponse.json(found);
    }),

    http.patch(`${API}/repos/${owner}/${repo}/issues/comments/:id`, async ({ params, request }) => {
      const found = find(comments, Number(params["id"]));
      if (!found) return HttpResponse.json({ message: "Not Found" }, { status: 404 });

      const { body } = (await request.json()) as { body: string };
      found.body = body;
      return HttpResponse.json(found);
    }),
  ];

  return {
    handlers,
    reset: () => comments.clear(),
    commentsOn: (pull) => [...commentsFor(pull)],
  };
}

/** A stable pull number per branch, so a branch always lands in one place. */
export function pullFor(branch: string): number {
  let hash = 7;
  for (const character of branch) hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  return hash + 1;
}

function find(comments: Map<number, StoredComment[]>, id: number): StoredComment | undefined {
  for (const list of comments.values()) {
    const found = list.find((comment) => comment.id === id);
    if (found) return found;
  }
  return undefined;
}

function nextLink(url: URL, page: number): string {
  const next = new URL(url);
  next.searchParams.set("page", String(page + 1));
  return `<${next.toString()}>; rel="next"`;
}

/** How the fake device flow should answer the next poll. */
export type DeviceStep = "pending" | "slow_down" | { token: string } | { error: string };

/** A fake of GitHub's two Device Flow endpoints. */
export interface DeviceFlowFake {
  readonly handlers: RequestHandler[];
  /** Answers given to successive polls, consumed in order. */
  respond(...steps: DeviceStep[]): void;
  /** How many times the token endpoint was polled. */
  readonly polls: () => number;
}

/** Creates the fake. `respond` sets what each poll returns, in order. */
export function createDeviceFlowFake(): DeviceFlowFake {
  let steps: DeviceStep[] = [];
  let polls = 0;

  const handlers: RequestHandler[] = [
    http.post(`${LOGIN}/login/device/code`, () =>
      HttpResponse.json({
        device_code: "dev-code-secret",
        user_code: "WDJB-MJHT",
        verification_uri: `${LOGIN}/login/device`,
        expires_in: 900,
        interval: 5,
      }),
    ),

    http.post(`${LOGIN}/login/oauth/access_token`, () => {
      polls += 1;
      const step = steps.shift() ?? "pending";

      if (step === "pending") return HttpResponse.json({ error: "authorization_pending" });
      if (step === "slow_down") return HttpResponse.json({ error: "slow_down", interval: 10 });
      if ("error" in step) return HttpResponse.json({ error: step.error });
      return HttpResponse.json({ access_token: step.token, scope: "", token_type: "bearer" });
    }),
  ];

  return {
    handlers,
    respond: (...next) => {
      steps = [...next];
      polls = 0;
    },
    polls: () => polls,
  };
}
