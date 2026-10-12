/**
 * A media connector that keeps screenshots on GitHub, as the user attachments
 * a pull-request comment holds when someone pastes an image into it.
 *
 * Only a personal access token may upload: a GitHub App's user token (the
 * reviewer's sign-in) and an installation token are both answered with a 404.
 * The attachment is readable by whoever can read the repository, and by nobody
 * else, so it needs no public bucket. docs/screenshots.md has the spikes.
 */

import { UpstreamError } from "../errors.js";
import { USER_AGENT } from "../internal/user-agent.js";

import type { MediaBlob, MediaRef } from "../types.js";
import type { MediaConnector } from "./types.js";

/** Options for {@link githubMedia}. */
export interface GitHubMediaOptions {
  /** The repository the attachment belongs to, and so who may see it. */
  readonly owner: string;
  readonly repo: string;
  /**
   * A personal access token: a bot's, scoped to this repository. A GitHub App
   * user token (`ghu_`) or an installation token is answered with a 404.
   */
  readonly token: string;
  /** Defaults to `https://api.github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Defaults to `https://uploads.github.com`. */
  readonly uploadUrl?: string;
  /** The host `getUrl` links to. Defaults to `https://github.com`. */
  readonly webUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Connector name reported to Maple. Defaults to `"github"`. */
  readonly name?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Creates a media connector backed by GitHub user attachments. */
export function githubMedia(options: GitHubMediaOptions): MediaConnector {
  const name = options.name ?? "github";
  const call = options.fetch ?? globalThis.fetch;
  const apiBase = options.baseUrl ?? "https://api.github.com";
  const uploadBase = options.uploadUrl ?? "https://uploads.github.com";
  const webBase = options.webUrl ?? "https://github.com";
  let repositoryId: Promise<number> | undefined;

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${options.token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": USER_AGENT,
  };

  async function lookUp(): Promise<number> {
    const path = `/repos/${options.owner}/${options.repo}`;
    const response = await call(apiBase + path, { headers });
    if (!response.ok) throw await failure(response, path);
    return ((await response.json()) as { id: number }).id;
  }

  /** Asked once; a failed answer is forgotten so the next upload asks again. */
  function repository(): Promise<number> {
    repositoryId ??= lookUp().catch((error: unknown) => {
      repositoryId = undefined;
      throw error;
    });
    return repositoryId;
  }

  async function putBlob(blob: MediaBlob): Promise<MediaRef> {
    const query = new URLSearchParams({
      content_type: blob.contentType,
      name: blob.filename ?? "screenshot",
      repository_id: String(await repository()),
    });
    const response = await call(`${uploadBase}/user-attachments/assets?${query.toString()}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/octet-stream" },
      body: blob.data as BodyInit,
    });
    if (!response.ok) throw await failure(response, "/user-attachments/assets");

    const key = keyOf(((await response.json()) as { url?: string }).url ?? "");
    return { connector: name, key, contentType: blob.contentType };
  }

  function getUrl(ref: MediaRef): Promise<string> {
    if (!UUID.test(ref.key)) {
      return Promise.reject(new RangeError(`No blob is held under ${ref.key}.`));
    }
    return Promise.resolve(`${webBase}/user-attachments/assets/${ref.key}`);
  }

  return { name, putBlob, getUrl };
}

/** The id GitHub gave the attachment: the last segment of the URL it answered with. */
function keyOf(url: string): string {
  const key = url.split("/").pop() ?? "";
  if (!UUID.test(key)) throw new Error(`GitHub answered an upload with no attachment id: ${url}`);
  return key;
}

async function failure(response: Response, path: string): Promise<UpstreamError> {
  const text = await response.text().catch(() => "");
  let message = text || response.statusText;
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    // Not JSON: the raw text is the message.
  }
  return new UpstreamError("GitHub", response.status, message, path);
}
