/**
 * The shared store-connector contract.
 *
 * Every store connector runs this suite. If it passes, Maple can use the
 * connector; if it fails, the failure names the exact promise that was broken.
 * The `contribute-connector` skill wires a new connector into it.
 */

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sampleComment } from "./fixtures.js";

import type { StoreConnector } from "../connectors/types.js";
import type { Comment, CommentStatus } from "../types.js";

/** What the suite needs in order to exercise a connector. */
export interface StoreContractOptions {
  /** Shown in the test names, e.g. "sqlite". */
  readonly name: string;
  /** Builds an isolated connector. Called once per test. */
  create(): Promise<StoreContractSubject>;
  /**
   * How long a write may take to become visible to a read. Backends without
   * read-your-writes set this; the suite then polls instead of asserting once.
   */
  readonly eventualConsistencyMs?: number;
}

/** A connector plus whatever is needed to tear it down. */
export interface StoreContractSubject {
  readonly connector: StoreConnector;
  cleanup?(): Promise<void>;
}

/** Unique branch per test, so a shared backend does not leak between them. */
function uniqueBranch(name: string): string {
  return `contract/${name}/${randomUUID().slice(0, 8)}`;
}

/** Polls `read` until `accept` is satisfied or the budget runs out. */
async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  budgetMs: number,
): Promise<T> {
  const deadline = Date.now() + budgetMs;
  let latest = await read();

  while (!accept(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await read();
  }
  return latest;
}

/** Runs the whole contract against one connector. */
export function runStoreContract(options: StoreContractOptions): void {
  const budget = options.eventualConsistencyMs ?? 0;

  describe(`store contract: ${options.name}`, () => {
    /** Runs `body` against a fresh connector and always cleans up. */
    async function withSubject(
      body: (connector: StoreConnector, branch: string) => Promise<void>,
    ): Promise<void> {
      const subject = await options.create();
      try {
        await body(subject.connector, uniqueBranch(options.name));
      } finally {
        await subject.cleanup?.();
      }
    }

    /** Lists `branch`, waiting out eventual consistency until `want` comments show. */
    async function listUntil(
      connector: StoreConnector,
      branch: string,
      want: number,
    ): Promise<readonly Comment[]> {
      const page = await eventually(
        () => connector.list({ branch }),
        (result) => result.comments.length >= want,
        budget,
      );
      return page.comments;
    }

    it("names itself", async () => {
      await withSubject((connector) => {
        expect(connector.name).toMatch(/^[a-z][a-z0-9-]*$/);
        return Promise.resolve();
      });
    });

    it("returns an empty page for a branch with no comments", async () => {
      await withSubject(async (connector, branch) => {
        const page = await connector.list({ branch });
        expect(page.comments).toEqual([]);
      });
    });

    it("assigns an id on append and echoes the comment back", async () => {
      await withSubject(async (connector, branch) => {
        const input = sampleComment({ anchor: { key: branch } });
        const stored = await connector.append(input);

        expect(stored.id).toBeTruthy();
        expect(stored.body).toBe(input.body);
        expect(stored.status).toBe("open");
      });
    });

    it("lists a comment it has appended", async () => {
      await withSubject(async (connector, branch) => {
        const stored = await connector.append(sampleComment({ anchor: { key: branch } }));
        const comments = await listUntil(connector, branch, 1);

        expect(comments.map((comment) => comment.id)).toContain(stored.id);
      });
    });

    it("honours the limit and keeps paging until the cursor runs out", async () => {
      await withSubject(async (connector, branch) => {
        for (let index = 0; index < 3; index += 1) {
          await connector.append(
            sampleComment({ body: `comment ${index}`, anchor: { key: branch } }),
          );
        }
        await listUntil(connector, branch, 3);

        const seen = new Set<string>();
        let cursor: string | undefined;
        let pages = 0;

        do {
          const page: { comments: readonly Comment[]; cursor?: string } = await connector.list({
            branch,
            limit: 2,
            ...(cursor === undefined ? {} : { cursor }),
          });
          expect(page.comments.length).toBeLessThanOrEqual(2);
          for (const comment of page.comments) seen.add(comment.id);
          cursor = page.cursor;
          pages += 1;
        } while (cursor !== undefined && pages < 10);

        expect(cursor).toBeUndefined();
        expect(seen.size).toBe(3);
      });
    });

    it("rejects a negative limit rather than guessing", async () => {
      await withSubject(async (connector, branch) => {
        await expect(connector.list({ branch, limit: -1 })).rejects.toThrow();
      });
    });

    describe("setStatus", () => {
      it("changes status and the change survives a re-read, when supported", async () => {
        await withSubject(async (connector, branch) => {
          const setStatus = connector.setStatus?.bind(connector);
          if (!setStatus) return;

          const stored = await connector.append(sampleComment({ anchor: { key: branch } }));
          const resolved = await setStatus(stored.id, "resolved");
          expect(resolved.status).toBe("resolved");

          const comments = await eventually(
            () => connector.list({ branch }).then((page) => page.comments),
            (list) => list.find((c) => c.id === stored.id)?.status === "resolved",
            budget,
          );
          expect(comments.find((c) => c.id === stored.id)?.status).toBe("resolved");
        });
      });

      it("rejects an unknown id rather than resolving silently, when supported", async () => {
        await withSubject(async (connector) => {
          const setStatus = connector.setStatus?.bind(connector);
          if (!setStatus) return;

          const status: CommentStatus = "resolved";
          await expect(setStatus("definitely-not-a-real-id", status)).rejects.toThrow();
        });
      });
    });
  });
}
