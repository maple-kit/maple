/**
 * A fake repository with an explicit table of pull requests, for the preview
 * route: each rung of the resolution ladder needs a table it can be told apart
 * on, which the branch-name conventions of `github.ts` cannot express.
 */

import { http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

const API = "https://api.github.com";

/** One pull request in the fake. */
export interface FakePull {
  readonly number: number;
  readonly head: string;
  readonly sha: string;
  readonly state: "open" | "closed";
}

export interface PullsFake {
  readonly handlers: RequestHandler[];
  add(...pulls: readonly FakePull[]): void;
  /** Makes every pull-request read answer with this status, until `reset`. */
  fail(status: number): void;
  /** Makes only `GET /commits/{sha}/pulls` answer with this status, until `reset`. */
  failCommits(status: number): void;
  /** Every pull-request read, as `GET /path`: what one request cost GitHub. */
  reads(): readonly string[];
  reset(): void;
  /** Every write, as `METHOD /path`. */
  writes(): readonly string[];
}

export function createPullsFake(owner = "maple-kit", repo = "app"): PullsFake {
  let pulls: readonly FakePull[] = [];
  let failing: number | undefined;
  let failingCommits: number | undefined;
  const writes: string[] = [];
  const reads: string[] = [];
  const counted = (request: Request): void => {
    reads.push(`GET ${new URL(request.url).pathname}`);
  };
  const shape = (one: FakePull) => ({
    number: one.number,
    state: one.state,
    head: { ref: one.head, sha: one.sha },
  });
  const refuse = () => HttpResponse.json({ message: "Server Error" }, { status: failing ?? 500 });

  const handlers: RequestHandler[] = [
    http.get(`${API}/repos/${owner}/${repo}/pulls/:number`, ({ params, request }) => {
      counted(request);
      if (failing !== undefined) return refuse();
      const found = pulls.find((one) => one.number === Number(params["number"]));
      return found
        ? HttpResponse.json(shape(found))
        : HttpResponse.json({ message: "Not Found" }, { status: 404 });
    }),
    http.get(`${API}/repos/${owner}/${repo}/pulls`, ({ request }) => {
      counted(request);
      if (failing !== undefined) return refuse();
      const query = new URL(request.url).searchParams;
      const head = query.get("head")?.split(":")[1];
      const state = query.get("state");
      const listed = pulls
        .filter((one) => (head === undefined ? true : one.head === head))
        .filter((one) => state === "all" || one.state === state);
      return HttpResponse.json(listed.map(shape));
    }),
    http.get(`${API}/repos/${owner}/${repo}/commits/:sha/pulls`, ({ params, request }) => {
      counted(request);
      if (failingCommits !== undefined) {
        return HttpResponse.json({ message: "No commit found" }, { status: failingCommits });
      }
      if (failing !== undefined) return refuse();
      const sha = String(params["sha"]);
      return HttpResponse.json(pulls.filter((one) => one.sha.startsWith(sha)).map(shape));
    }),
    http.get(`${API}/repos/${owner}/${repo}/issues/:pull/comments`, () => HttpResponse.json([])),
    http.post(`${API}/repos/${owner}/${repo}/issues/:pull/comments`, ({ params }) => {
      writes.push(`POST /issues/${String(params["pull"])}/comments`);
      return HttpResponse.json({ id: 1, body: "" }, { status: 201 });
    }),
  ];

  return {
    handlers,
    add: (...more) => {
      pulls = [...pulls, ...more];
    },
    fail: (status) => {
      failing = status;
    },
    failCommits: (status) => {
      failingCommits = status;
    },
    reads: () => reads,
    reset: () => {
      pulls = [];
      failing = undefined;
      failingCommits = undefined;
      reads.length = 0;
      writes.length = 0;
    },
    writes: () => writes,
  };
}
