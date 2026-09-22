/**
 * The Maple route, faked.
 *
 * The client reads its own route back after writing to it — a comment it posts
 * has to appear in the list, and a status it patches has to stay patched — so
 * this keeps comments in an array rather than answering with a fixed page.
 * Each suite creates its own; a shared one turns a real failure into a flake.
 */

import { http, HttpResponse } from "msw";

import type { Pillar, PillarScore } from "../../src/connectors/types.js";
import type { Approval, Comment, CommentStatus, MapleUser, NewComment } from "../../src/types.js";
import type { RequestHandler } from "msw";

/** The origin a test's route is mounted on. */
export const MAPLE_ORIGIN = "https://preview.example.com";

/** The base path the client is pointed at in a test. */
export const MAPLE_BASE = `${MAPLE_ORIGIN}/api/maple`;

/** A running fake of the route. */
export interface MapleFake {
  readonly handlers: RequestHandler[];
  /** Everything posted so far, newest last. */
  comments(): readonly Comment[];
  seed(...comments: Comment[]): void;
  /** Every comment `POST /assist` was asked to judge, oldest first. */
  judged(): readonly string[];
  /** Every approval recorded so far, newest last. */
  approvals(): readonly Approval[];
}

/** How the fake answers `GET /me`. */
export interface MapleFakeOptions {
  /** Null answers with no session, which is the guest flow. */
  readonly user?: MapleUser | null;
  /** Hand back one page at a time, so cursor following is exercised. */
  readonly pageSize?: number;
  /** Whether the route keeps screenshots. True unless a suite says otherwise. */
  readonly media?: boolean;
  /** The pillars `/me` reports. Absent means this deployment judges nothing. */
  readonly pillars?: readonly Pillar[];
  /**
   * Whether the store keeps approvals. False — the default — answers 501 on
   * `/approvals`, which is how the client learns there is nothing to offer.
   */
  readonly approvals?: boolean;
  /** Whether `/me` says the gate is held until somebody approves. */
  readonly requireApproval?: boolean;
  /** The commit an approval is recorded against. */
  readonly head?: string;
}

/** Builds the fake. */
export function createMapleFake(options: MapleFakeOptions = {}): MapleFake {
  const stored: Comment[] = [];
  const approved: Approval[] = [];
  const judged: string[] = [];
  const user = options.user === undefined ? { id: "u_7", name: "Reviewer" } : options.user;
  let next = 0;

  return {
    comments: () => stored,
    judged: () => judged,
    approvals: () => approved,
    seed: (...comments) => stored.push(...comments),
    handlers: [
      http.post(`${MAPLE_BASE}/assist`, async ({ request }) => {
        const asked = (await request.json()) as { body: string };
        judged.push(asked.body);
        return HttpResponse.json({
          scores: (options.pillars ?? []).map(topOf),
          kind: {
            kind: "bug",
            distribution: { bug: 1, copy: 0, other: 0, praise: 0, question: 0, request: 0 },
            confidence: 1,
          },
        });
      }),
      http.get(`${MAPLE_BASE}/comments`, ({ request }) => page(stored, request, options.pageSize)),
      http.post(`${MAPLE_BASE}/comments`, async ({ request }) => {
        const posted = (await request.json()) as NewComment | NewComment[];
        const batch = Array.isArray(posted);
        const made = (batch ? posted : [posted]).map((one) => {
          next += 1;
          return stored[stored.push(appended(one, next, user)) - 1]!;
        });
        return HttpResponse.json(batch ? { comments: made } : made[0], { status: 201 });
      }),
      http.patch(`${MAPLE_BASE}/comments/:id`, async ({ params, request }) => {
        const change = (await request.json()) as { status: CommentStatus };
        const found = stored.findIndex((comment) => comment.id === params["id"]);
        if (found < 0) return HttpResponse.json({ error: "Not found" }, { status: 404 });

        stored[found] = { ...stored[found]!, status: change.status };
        return HttpResponse.json(stored[found]);
      }),
      http.get(`${MAPLE_BASE}/me`, () =>
        HttpResponse.json({
          user,
          media: options.media !== false,
          approval: { required: options.requireApproval === true },
          ...(options.pillars === undefined ? {} : { assist: { pillars: options.pillars } }),
        }),
      ),
      http.get(`${MAPLE_BASE}/approvals`, () =>
        options.approvals === true
          ? HttpResponse.json({ approvals: approved })
          : HttpResponse.json({ error: "This store keeps no approvals" }, { status: 501 }),
      ),
      http.post(`${MAPLE_BASE}/approvals`, async ({ request }) => {
        if (options.approvals !== true) {
          return HttpResponse.json({ error: "This store keeps no approvals" }, { status: 501 });
        }
        if (!user) return HttpResponse.json({ error: "Sign in first" }, { status: 401 });

        const asked = (await request.json()) as { branch: string; note?: string };
        next += 1;
        const approval: Approval = {
          id: `app_${String(next)}`,
          branch: asked.branch,
          commit: options.head ?? "1f3c9ab",
          author: { id: user.id, name: user.name, provenance: "server", colorSlot: 3 },
          at: new Date(0).toISOString(),
          ...(asked.note === undefined ? {} : { note: asked.note }),
        };
        approved.push(approval);
        return HttpResponse.json(approval, { status: 201 });
      }),
      http.delete(`${MAPLE_BASE}/approvals/:id`, ({ params }) => {
        const found = approved.findIndex((one) => one.id === params["id"]);
        if (found < 0) return HttpResponse.json({ error: "Not found" }, { status: 404 });

        const [gone] = approved.splice(found, 1);
        return HttpResponse.json({ branch: gone?.branch });
      }),
      http.post(`${MAPLE_BASE}/media`, ({ request }) => {
        next += 1;
        const contentType = request.headers.get("content-type") ?? "image/png";
        const ref = { connector: "memory", key: `shot-${String(next)}`, contentType };
        return HttpResponse.json(ref, { status: 201 });
      }),
    ],
  };
}

/** The top rung, certainly: a fake answers the same way every time on purpose. */
function topOf(pillar: Pillar): PillarScore {
  const level = pillar.levels.length - 1;
  return {
    pillar: pillar.id,
    level,
    distribution: pillar.levels.map((_, index) => (index === level ? 1 : 0)),
    confidence: 1,
  };
}

/** The route's own 500, which says nothing about the store behind it. */
export function mapleUnavailable(): RequestHandler {
  return http.get(`${MAPLE_BASE}/comments`, () =>
    HttpResponse.json({ error: "Something went wrong" }, { status: 500 }),
  );
}

/** The author is the route's to assign; a posted one is ignored here too. */
function appended(posted: NewComment, id: number, user: MapleUser | null): Comment {
  return {
    ...posted,
    id: `c_${id}`,
    status: "open",
    author: user
      ? { id: user.id, name: user.name, provenance: "server", colorSlot: 3 }
      : { id: "guest", name: "Guest", provenance: "guest" },
  };
}

function page(stored: readonly Comment[], request: Request, size: number | undefined): Response {
  const from = Number(new URL(request.url).searchParams.get("cursor") ?? "0");
  const to = size === undefined ? stored.length : Math.min(from + size, stored.length);

  return HttpResponse.json({
    comments: stored.slice(from, to),
    ...(to < stored.length ? { cursor: String(to) } : {}),
  });
}
