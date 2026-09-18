/**
 * GitHub pull-request store connector, and Maple's default store.
 *
 * Consistency: read-your-writes. GitHub's REST API is strongly consistent for
 * a comment's own repository.
 * Retention: as long as the pull request exists.
 * Credentials: one token, server-side only. It never reaches the overlay.
 */

import { exportMarkdown, parseFence } from "../export/markdown.js";

import type { Comment, CommentStatus, NewComment } from "../types.js";
import type { CommentPage, ListQuery, StoreConnector } from "./types.js";

/** Everything the connector needs to reach a repository. */
export interface GitHubStoreOptions {
  readonly owner: string;
  readonly repo: string;
  /**
   * A user-to-server or installation token. Never a value written into a file:
   * read it from the environment at the call site.
   */
  readonly token: string;
  /** Defaults to `https://api.github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE = "https://api.github.com";
const PAGE_SIZE = 100;
const ID = /^gh_(\d+)_(\d+)$/;

/** Creates a store connector backed by a pull request's comments. */
export function githubStore(options: GitHubStoreOptions): StoreConnector {
  const api = createClient(options);

  return {
    name: "github",
    list: (query) => list(api, query),
    append: (comment) => append(api, comment),
    setStatus: (id, status) => setStatus(api, id, status),
  };
}

/** The narrow GitHub client the rest of this file is written against. */
interface Client {
  readonly options: GitHubStoreOptions;
  request<T>(path: string, init?: RequestInit): Promise<Paged<T>>;
}

interface Paged<T> {
  readonly body: T;
  readonly hasNext: boolean;
}

/** One issue comment, trimmed to what this connector reads. */
interface IssueComment {
  readonly id: number;
  readonly body: string;
}

interface PullRequest {
  readonly number: number;
}

function createClient(options: GitHubStoreOptions): Client {
  const base = options.baseUrl ?? DEFAULT_BASE;
  const call = options.fetch ?? globalThis.fetch;

  return {
    options,
    async request<T>(path: string, init: RequestInit = {}): Promise<Paged<T>> {
      const response = await call(`${base}${path}`, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${options.token}`,
          "x-github-api-version": "2022-11-28",
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
      });

      if (!response.ok) throw await failure(response, path);
      return { body: (await response.json()) as T, hasNext: hasNextPage(response) };
    },
  };
}

/**
 * GitHub's message, not ours. Core maps this to `MapleStoreError` and decides
 * what to retry; swallowing it here would take that decision away.
 */
async function failure(response: Response, path: string): Promise<Error> {
  const detail = await response.text().catch(() => "");
  const parsed: unknown = detail ? safeJson(detail) : undefined;
  const message =
    typeof parsed === "object" && parsed !== null && "message" in parsed
      ? String(parsed.message)
      : detail || response.statusText;

  return new Error(`GitHub ${String(response.status)} on ${path}: ${message}`);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function hasNextPage(response: Response): boolean {
  return (response.headers.get("link") ?? "").includes('rel="next"');
}

/** The pull request a branch belongs to, or undefined when it has none open. */
async function pullFor(api: Client, branch: string): Promise<number | undefined> {
  const { owner, repo } = api.options;
  const head = encodeURIComponent(`${owner}:${branch}`);
  const path = `/repos/${owner}/${repo}/pulls?head=${head}&state=all&per_page=1`;
  const { body } = await api.request<PullRequest[]>(path);
  return body[0]?.number;
}

async function list(api: Client, query: ListQuery): Promise<CommentPage> {
  if (query.limit !== undefined && query.limit <= 0) {
    throw new RangeError(`limit must be positive, received ${String(query.limit)}`);
  }

  const pull = await pullFor(api, query.branch);
  if (pull === undefined) return { comments: [] };

  const page = query.cursor === undefined ? 1 : pageOf(query.cursor);
  const perPage = Math.min(query.limit ?? PAGE_SIZE, PAGE_SIZE);
  const path = `/repos/${api.options.owner}/${api.options.repo}/issues/${String(pull)}/comments?per_page=${String(perPage)}&page=${String(page)}`;

  const { body, hasNext } = await api.request<IssueComment[]>(path);
  const comments = body
    .map((issue) => commentIn(issue, pull, query.branch))
    .filter((comment): comment is Comment => comment !== undefined)
    .filter((comment) => query.statuses === undefined || query.statuses.includes(comment.status));

  return { comments, ...(hasNext ? { cursor: String(page + 1) } : {}) };
}

/** Reads Maple's fence out of an issue comment, ignoring everyone else's. */
function commentIn(issue: IssueComment, pull: number, branch: string): Comment | undefined {
  const fence = parseFence(issue.body);
  const stored = fence?.comments[0];
  if (!stored) return undefined;

  return { ...stored, id: idOf(pull, issue.id), branch };
}

async function append(api: Client, comment: NewComment): Promise<Comment> {
  const pull = await pullFor(api, comment.branch);
  if (pull === undefined) {
    throw new Error(`No pull request for branch ${comment.branch}; Maple has nowhere to post.`);
  }

  const draft: Comment = { ...comment, id: "", status: comment.status ?? "open" };
  const created = await api.request<IssueComment>(
    `/repos/${api.options.owner}/${api.options.repo}/issues/${String(pull)}/comments`,
    { method: "POST", body: JSON.stringify({ body: bodyFor(draft) }) },
  );

  const stored: Comment = { ...draft, id: idOf(pull, created.body.id) };
  await patch(api, created.body.id, bodyFor(stored));
  return stored;
}

async function setStatus(api: Client, id: string, status: CommentStatus): Promise<Comment> {
  const located = ID.exec(id);
  if (!located) throw new Error(`Not a GitHub comment id: ${id}`);

  const issueId = Number(located[2]);
  const { body } = await api.request<IssueComment>(
    `/repos/${api.options.owner}/${api.options.repo}/issues/comments/${String(issueId)}`,
  );

  const stored = parseFence(body.body)?.comments[0];
  if (!stored) throw new Error(`Comment ${id} carries no Maple fence.`);

  const updated: Comment = { ...stored, id, status };
  await patch(api, issueId, bodyFor(updated));
  return updated;
}

async function patch(api: Client, issueId: number, body: string): Promise<void> {
  await api.request<IssueComment>(
    `/repos/${api.options.owner}/${api.options.repo}/issues/comments/${String(issueId)}`,
    { method: "PATCH", body: JSON.stringify({ body }) },
  );
}

/** One comment per issue comment, so GitHub's own threading and notifications work. */
function bodyFor(comment: Comment): string {
  return exportMarkdown([comment], { branch: comment.branch }).markdown;
}

function idOf(pull: number, issueId: number): string {
  return `gh_${String(pull)}_${String(issueId)}`;
}

function pageOf(cursor: string): number {
  const page = Number(cursor);
  if (!Number.isInteger(page) || page < 1) throw new RangeError(`Invalid cursor: ${cursor}`);
  return page;
}
