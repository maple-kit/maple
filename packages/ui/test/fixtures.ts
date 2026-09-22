/**
 * The nine comments the island is drawn against.
 *
 * Between them they cover all four statuses, all four reasons an anchor loses
 * its place, all three provenances, the whole rung ladder and both host
 * schemes, so a suite that renders them renders every state the list has. The
 * counts are: nine in all, three open, one re-verify, one resolved and four
 * unpinned — which is a pill reading `8 open`.
 */

import type { Comment, CommentAuthor, CommentContext } from "@maple-kit/core";

/** The branch every fixture belongs to. */
export const BRANCH = "preview/pr-128";

const PEOPLE: Readonly<Record<string, CommentAuthor>> = {
  sam: { id: "sam", name: "Sam", provenance: "server", colorSlot: 6 },
  priya: { id: "priya", name: "Priya", provenance: "client", colorSlot: 0 },
  revA: { id: "revA", name: "Reviewer A", provenance: "guest", colorSlot: 3 },
  jules: { id: "jules", name: "Jules", provenance: "server", colorSlot: 8 },
  noor: { id: "noor", name: "Noor", provenance: "server", colorSlot: 4 },
};

const CONTEXT: CommentContext = {
  url: "https://preview.example/dashboard",
  viewportWidth: 1180,
  viewportHeight: 900,
  contentWidth: 1180,
  devicePixelRatio: 2,
  colorScheme: "light",
  breakpoint: "lg",
};

/** A body long enough to be clamped, so `Show all` has something to reveal. */
export const LONG_BODY =
  "The yield number is doing too much work here: it is the only figure on the card " +
  "that changes on a range switch, and at a glance it reads as a total rather than " +
  "a rate. Either label it or move it under the fold, but it cannot stay where it " +
  "is with the type at this weight.";

function at(day: number): string {
  return `2026-09-${String(day).padStart(2, "0")}T09:00:00.000Z`;
}

/** The nine, oldest first, so a row's number is its place in this array. */
export const COMMENTS: readonly Comment[] = [
  {
    id: "c1",
    branch: BRANCH,
    body: "This should say MRR, not revenue.",
    status: "open",
    createdAt: at(1),
    author: PEOPLE["sam"]!,
    anchor: { key: "kpi-mrr", component: "MrrCard" },
    context: CONTEXT,
  },
  {
    id: "c2",
    branch: BRANCH,
    body: LONG_BODY,
    status: "open",
    createdAt: at(2),
    author: PEOPLE["revA"]!,
    anchor: { source: "app/dashboard/page.tsx:42:7", component: "YieldCard" },
    context: CONTEXT,
    attachments: [{ connector: "memory", key: "shot-1", contentType: "image/png" }],
  },
  {
    id: "c3",
    branch: BRANCH,
    body: "The title wraps on a narrow window.",
    status: "needs_reverify",
    createdAt: at(3),
    author: PEOPLE["priya"]!,
    anchor: { component: "PageTitle" },
    context: { ...CONTEXT, colorScheme: "dark", breakpoint: "md" },
  },
  {
    id: "c4",
    branch: BRANCH,
    body: "This paragraph contradicts the chart above it.",
    status: "resolved",
    createdAt: at(4),
    author: PEOPLE["sam"]!,
    anchor: {
      quote: { exact: "retention held steady", prefix: "Overall " },
      component: "Retention",
    },
    context: CONTEXT,
    resolution: { sha: "a1b2c3d", at: at(5) },
  },
  {
    id: "c5",
    branch: BRANCH,
    body: "The panel opens under the header.",
    status: "open",
    createdAt: at(5),
    author: PEOPLE["jules"]!,
    anchor: { selector: "#settings-panel" },
    context: CONTEXT,
  },
  {
    id: "c6",
    branch: BRANCH,
    body: "The empty state here is doing nothing.",
    status: "orphaned",
    createdAt: at(6),
    author: PEOPLE["revA"]!,
    anchor: {
      key: "gone-key",
      source: "app/gone/page.tsx:3:1",
      component: "GoneComponent",
      quote: { exact: "nothing written here survives the next deploy of this route" },
      selector: "#gone-entirely",
    },
    context: { ...CONTEXT, viewportWidth: 390, contentWidth: 390, breakpoint: "sm" },
  },
  {
    id: "c7",
    branch: BRANCH,
    body: "This sentence lost its subject.",
    status: "orphaned",
    createdAt: at(7),
    author: PEOPLE["priya"]!,
    anchor: {
      quote: {
        exact: "the retention paragraph reads the same as it did before",
        prefix: "Last quarter ",
        suffix: " in every region.",
      },
      selector: "#no-such-copy",
    },
    context: { ...CONTEXT, colorScheme: "dark" },
  },
  {
    id: "c8",
    branch: BRANCH,
    body: "Two of these cards are identical.",
    status: "orphaned",
    createdAt: at(8),
    author: PEOPLE["noor"]!,
    anchor: { component: "CardGrid", selector: "#no-such-card" },
    context: CONTEXT,
  },
  {
    id: "c9",
    branch: BRANCH,
    body: "Written before the build tagged anything.",
    status: "orphaned",
    createdAt: at(9),
    author: PEOPLE["revA"]!,
    anchor: {},
    context: { ...CONTEXT, viewportWidth: 834, contentWidth: 834, breakpoint: "md" },
  },
];

/**
 * The page the orphans are resolved against: two cards nothing tells apart, and
 * a paragraph edited past the point where its quote can be trusted.
 */
export const PAGE_HTML = `
<main id="page-under-review">
  <div data-maple-name="CardGrid">One</div>
  <div data-maple-name="CardGrid">Two</div>
  <p id="changed-copy">the retention paragraph now reads nothing like it once did</p>
</main>
`;

/** Answers the route with the fixtures, and `/me` with no session. */
export function fixtureFetch(comments: readonly Comment[] = COMMENTS): typeof globalThis.fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/approvals")) return Promise.resolve(noApprovals());

    const patch = (init?.method ?? "GET") === "PATCH";
    const body = patch && init ? patched(url, comments, init) : listing(url, comments);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

/** The default deployment keeps no approvals, so the row is never drawn. */
function noApprovals(): Response {
  return new Response(JSON.stringify({ error: "This store keeps no approvals" }), {
    status: 501,
    headers: { "content-type": "application/json" },
  });
}

function listing(url: string, comments: readonly Comment[]): unknown {
  return url.includes("/me") ? { user: null } : { comments };
}

/**
 * A status change answers with the comment as it now is, which is what the
 * route does: the controller replaces its copy rather than guessing.
 */
function patched(
  url: string,
  comments: readonly Comment[],
  init: RequestInit,
): Comment | undefined {
  const id = decodeURIComponent(url.split("/comments/")[1] ?? "");
  const found = comments.find((one) => one.id === id);
  if (!found) return undefined;

  const sent = typeof init.body === "string" ? init.body : "{}";
  const change = JSON.parse(sent) as { status?: Comment["status"] };
  return { ...found, ...(change.status === undefined ? {} : { status: change.status }) };
}

/** What `/me` reports about the sign-in a deployment offers, if any. */
export interface RefusalOptions {
  readonly status: number;
  /** Absent means a route with no GitHub sign-in at all. */
  readonly github?: { readonly linked: boolean; readonly login?: string };
}

/**
 * A route that refuses the comment calls and still answers `/me`, which is the
 * shape of a preview whose store is built per reviewer: identity resolves, the
 * store does not exist until they have signed in.
 */
export function refusingFetch(options: RefusalOptions): typeof globalThis.fetch {
  return (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/me")) {
      const body = { user: null, ...(options.github ? { github: options.github } : {}) };
      return Promise.resolve(Response.json(body));
    }

    return Promise.resolve(
      Response.json(
        { error: "This reviewer has no store to write to" },
        { status: options.status },
      ),
    );
  };
}
