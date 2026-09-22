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
import type { Approval, Comment, CommentStatus, NewApproval } from "../types.js";

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

/** Runs a body against a fresh connector and a fresh branch, and cleans up. */
function subjectRunner(
  options: StoreContractOptions,
): (body: (connector: StoreConnector, branch: string) => Promise<void>) => Promise<void> {
  return async (body) => {
    const subject = await options.create();
    try {
      await body(subject.connector, uniqueBranch(options.name));
    } finally {
      await subject.cleanup?.();
    }
  };
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

  const withSubject = subjectRunner(options);

  describe(`store contract: ${options.name}`, () => {
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
        const input = sampleComment({ branch });
        const stored = await connector.append(input);

        expect(stored.id).toBeTruthy();
        expect(stored.body).toBe(input.body);
        expect(stored.status).toBe("open");
      });
    });

    it("lists a comment it has appended", async () => {
      await withSubject(async (connector, branch) => {
        const stored = await connector.append(sampleComment({ branch }));
        const comments = await listUntil(connector, branch, 1);

        expect(comments.map((comment) => comment.id)).toContain(stored.id);
      });
    });

    it("keeps parentId, which is reserved for replies and never set by Maple", async () => {
      await withSubject(async (connector, branch) => {
        const stored = await connector.append(sampleComment({ branch, parentId: "c_parent" }));
        expect(stored.parentId).toBe("c_parent");

        const comments = await listUntil(connector, branch, 1);
        expect(comments.find((comment) => comment.id === stored.id)?.parentId).toBe("c_parent");
      });
    });

    it("honours the limit and keeps paging until the cursor runs out", async () => {
      await withSubject(async (connector, branch) => {
        for (let index = 0; index < 3; index += 1) {
          await connector.append(sampleComment({ body: `comment ${index}`, branch }));
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

          const stored = await connector.append(sampleComment({ branch }));
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

      it("keeps the resolution it was given, when supported", async () => {
        await withSubject(async (connector, branch) => {
          const setStatus = connector.setStatus?.bind(connector);
          if (!setStatus) return;

          const stored = await connector.append(sampleComment({ branch }));
          const resolution = {
            sha: "9f1c0de",
            note: "Matched the card's padding.",
            at: "2026-02-03T09:15:00.000Z",
          };
          const resolved = await setStatus(stored.id, "resolved", resolution);
          expect(resolved.resolution).toEqual(resolution);

          const comments = await eventually(
            () => connector.list({ branch }).then((page) => page.comments),
            (list) => list.find((c) => c.id === stored.id)?.resolution !== undefined,
            budget,
          );
          expect(comments.find((c) => c.id === stored.id)?.resolution).toEqual(resolution);
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

    approvalContract(options, budget);
  });
}

/** Kept apart so `runStoreContract` stays inside its own length limit. */
function approvalContract(options: StoreContractOptions, budget: number): void {
  const withSubject = subjectRunner(options);

  describe("approvals", () => {
    it("reads back an approval it recorded, when supported", async () => {
      await withSubject(async (connector, branch) => {
        const pair = approving(connector);
        if (!pair) return;

        const stored = await pair.approve(sampleApproval(branch));
        expect(stored.id).toBeTruthy();
        expect(stored.commit).toBe(COMMIT);

        const found = await eventually(
          () => pair.approvals(branch),
          (list) => list.length >= 1,
          budget,
        );
        expect(found.map((one) => one.id)).toContain(stored.id);
      });
    });

    it("keeps the commit and the author, which are what a gate reads", async () => {
      await withSubject(async (connector, branch) => {
        const pair = approving(connector);
        if (!pair) return;

        const input = sampleApproval(branch, { note: "Looks right on mobile too." });
        const stored = await pair.approve(input);

        const found = await eventually(
          () => pair.approvals(branch),
          (list) => list.some((one) => one.id === stored.id),
          budget,
        );
        const read = found.find((one) => one.id === stored.id);
        expect(read?.commit).toBe(input.commit);
        expect(read?.author.id).toBe(input.author.id);
        expect(read?.note).toBe(input.note);
      });
    });

    it("keeps one branch's approvals out of another's", async () => {
      await withSubject(async (connector, branch) => {
        const pair = approving(connector);
        if (!pair) return;

        await pair.approve(sampleApproval(branch));
        const elsewhere = await pair.approvals(`${branch}-other`);
        expect(elsewhere).toEqual([]);
      });
    });

    it("stops reporting an approval that was taken back, when supported", async () => {
      await withSubject(async (connector, branch) => {
        const pair = approving(connector);
        const unapprove = connector.unapprove?.bind(connector);
        if (!pair || !unapprove) return;

        const stored = await pair.approve(sampleApproval(branch));
        await unapprove(stored.id);

        const found = await eventually(
          () => pair.approvals(branch),
          (list) => !list.some((one) => one.id === stored.id),
          budget,
        );
        expect(found.map((one) => one.id)).not.toContain(stored.id);
      });
    });
  });
}

/** The commit every contract approval is about, so a gate has one to match. */
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** The two methods a gate needs together, bound, or nothing to exercise. */
interface Approving {
  approvals(branch: string): Promise<readonly Approval[]>;
  approve(approval: NewApproval): Promise<Approval>;
}

/**
 * A store with one and not the other has recorded what nothing can read, so
 * the suite skips rather than half-exercising it.
 */
function approving(connector: StoreConnector): Approving | undefined {
  const approvals = connector.approvals?.bind(connector);
  const approve = connector.approve?.bind(connector);
  return approvals && approve ? { approvals, approve } : undefined;
}

function sampleApproval(branch: string, overrides: Partial<NewApproval> = {}): NewApproval {
  return {
    branch,
    commit: COMMIT,
    author: { id: "contract-reviewer", name: "Contract Reviewer", provenance: "server" },
    at: new Date().toISOString(),
    ...overrides,
  };
}
