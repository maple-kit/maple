/**
 * A fake of GitHub's user-attachment upload, as it answers different tokens.
 *
 * It mirrors what a spike against a private repository found: a user token
 * uploads and is given a permanent URL, and an installation token is answered
 * with a 404, as is a repository id the token cannot see.
 */

import { http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";

/** One upload the fake accepted. */
export interface Upload {
  readonly id: string;
  readonly name: string | null;
  readonly contentType: string | null;
  readonly repositoryId: string | null;
  readonly bytes: Uint8Array;
}

/** A fake upload endpoint, and what it was given. */
export interface AttachmentsFake {
  readonly handlers: RequestHandler[];
  readonly uploads: Upload[];
  /** How many times the repository was looked up. */
  lookups(): number;
}

/** Creates the fake. A token absent from `userTokens` meets the 404 an installation token does. */
export function createAttachmentsFake(
  userTokens: readonly string[],
  owner = "maple-kit",
  repo = "app",
  repositoryId = 4242,
): AttachmentsFake {
  const uploads: Upload[] = [];
  let lookups = 0;
  const bearer = (request: Request): string =>
    (request.headers.get("authorization") ?? "").replace(/^Bearer /u, "");

  const handlers: RequestHandler[] = [
    http.get(`${API}/repos/${owner}/${repo}`, () => {
      lookups += 1;
      return HttpResponse.json({ id: repositoryId, full_name: `${owner}/${repo}` });
    }),
    http.post(`${UPLOADS}/user-attachments/assets`, async ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (
        !userTokens.includes(bearer(request)) ||
        query.get("repository_id") !== String(repositoryId)
      ) {
        return HttpResponse.json({ message: "Not Found" }, { status: 404 });
      }
      const id = crypto.randomUUID();
      uploads.push({
        id,
        name: query.get("name"),
        contentType: query.get("content_type"),
        repositoryId: query.get("repository_id"),
        bytes: new Uint8Array(await request.arrayBuffer()),
      });
      return HttpResponse.json(
        { url: `https://github.com/user-attachments/assets/${id}` },
        { status: 201 },
      );
    }),
  ];

  return { handlers, uploads, lookups: () => lookups };
}
