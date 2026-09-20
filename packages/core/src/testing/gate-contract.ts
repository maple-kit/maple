/**
 * The shared gate-connector contract.
 *
 * Every gate connector runs this suite. The property it exists to protect is
 * the one that sank Chromatic: a gate that blocks must be able to stop
 * blocking, on the same commit, without a new push.
 */

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decideGate } from "../gate/decide.js";
import { storedComment } from "./fixtures.js";

import type { GateConnector, GateTarget } from "../connectors/types.js";

/** What the suite needs in order to exercise a connector. */
export interface GateContractOptions {
  /** Shown in the test names, e.g. "github". */
  readonly name: string;
  /** Builds an isolated connector. Called once per test. */
  create(): Promise<GateContractSubject>;
}

/** A connector plus whatever is needed to tear it down. */
export interface GateContractSubject {
  readonly connector: GateConnector;
  cleanup?(): Promise<void>;
}

const BLOCKED = decideGate([storedComment({ status: "open" })]);
const CLEAR = decideGate([storedComment({ status: "resolved" })]);
const NO_REVIEW = decideGate(undefined, { hasReview: false });

/** Unique commit per test, so a shared backend does not leak between them. */
function target(name: string): GateTarget {
  return { branch: `contract/${name}`, sha: randomUUID().replaceAll("-", "") };
}

/** Runs the whole contract against one connector. */
export function runGateContract(options: GateContractOptions): void {
  describe(`gate contract: ${options.name}`, () => {
    /** Runs `body` against a fresh connector and always cleans up. */
    async function withSubject(
      body: (connector: GateConnector, at: GateTarget) => Promise<void>,
    ): Promise<void> {
      const subject = await options.create();
      try {
        await body(subject.connector, target(options.name));
      } finally {
        await subject.cleanup?.();
      }
    }

    it("publishes a verdict without throwing", async () => {
      await withSubject(async (connector, at) => {
        await expect(connector.publish({ ...at, verdict: BLOCKED })).resolves.toBeUndefined();
      });
    });

    it("lets a blocked commit become clear without a new commit", async () => {
      await withSubject(async (connector, at) => {
        await connector.publish({ ...at, verdict: BLOCKED });
        await connector.publish({ ...at, verdict: CLEAR });

        if (!connector.read) return;
        expect((await connector.read(at))?.conclusion).toBe("clear");
      });
    });

    it("reads back the verdict it last published", async () => {
      await withSubject(async (connector, at) => {
        await connector.publish({ ...at, verdict: BLOCKED, reviewUrl: "https://preview.test/" });

        if (!connector.read) return;
        const read = await connector.read(at);
        expect(read?.conclusion).toBe("blocked");
        expect(read?.open).toBe(BLOCKED.open);
      });
    });

    it("reports on a commit it was never reviewing, without blocking it", async () => {
      await withSubject(async (connector, at) => {
        await connector.publish({ ...at, verdict: NO_REVIEW });

        if (!connector.read) return;
        const read = await connector.read(at);
        expect(read?.conclusion).toBe("neutral");
        expect(read?.reason).toBe("no-review");
      });
    });

    it("says nothing about a commit it was never told about", async () => {
      await withSubject(async (connector, at) => {
        if (!connector.read) return;
        expect(await connector.read(at)).toBeUndefined();
      });
    });

    it("keeps one commit's verdict out of another's", async () => {
      await withSubject(async (connector, at) => {
        const other = { ...at, sha: randomUUID().replaceAll("-", "") };
        await connector.publish({ ...at, verdict: BLOCKED });
        await connector.publish({ ...other, verdict: CLEAR });

        if (!connector.read) return;
        expect((await connector.read(at))?.conclusion).toBe("blocked");
        expect((await connector.read(other))?.conclusion).toBe("clear");
      });
    });
  });
}
