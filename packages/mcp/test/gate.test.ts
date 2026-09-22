import { memoryGate, memoryStore, sampleComment } from "@maple-kit/core/testing";
import { describe, expect, it } from "vitest";

import { createToolHandlers } from "../src/handlers.js";

import type { Comment, StoreConnector } from "@maple-kit/core";

const BRANCH = "feature/agent";
const HEAD = "9ab1c2d";

async function seeded(count: number): Promise<{ store: StoreConnector; comments: Comment[] }> {
  const store = memoryStore({ heads: { [BRANCH]: HEAD } });
  const comments: Comment[] = [];
  for (let index = 0; index < count; index += 1) {
    comments.push(await store.append(sampleComment({ branch: BRANCH })));
  }
  return { store, comments };
}

describe("what the gate hears when the agent resolves something", () => {
  it("publishes a verdict rather than waiting for a push", async () => {
    const { store, comments } = await seeded(2);
    const gate = memoryGate();
    const handlers = createToolHandlers({ store, gate });

    await handlers.resolveComment({ id: comments[0]!.id, sha: HEAD });

    expect(gate.history({ branch: BRANCH, sha: HEAD }).at(-1)).toMatchObject({
      conclusion: "blocked",
      reason: "comments-open",
      open: 1,
    });
  });

  it("clears the check on the last resolve, with nobody pushing anything", async () => {
    const { store, comments } = await seeded(2);
    const gate = memoryGate();
    const handlers = createToolHandlers({ store, gate });

    for (const comment of comments) {
      await handlers.resolveComment({ id: comment.id, sha: HEAD });
    }

    expect(gate.history({ branch: BRANCH, sha: HEAD }).at(-1)).toMatchObject({
      conclusion: "clear",
      reason: "all-resolved",
    });
  });

  it("still blocks on the missing approval where one is required", async () => {
    const { store, comments } = await seeded(1);
    const gate = memoryGate();
    const handlers = createToolHandlers({ store, gate, requireApproval: true });

    await handlers.resolveComment({ id: comments[0]!.id, sha: HEAD });

    expect(gate.history({ branch: BRANCH, sha: HEAD }).at(-1)).toMatchObject({
      conclusion: "blocked",
      reason: "awaiting-approval",
    });
  });

  it("resolves exactly as before where no gate is configured", async () => {
    const { store, comments } = await seeded(1);
    const handlers = createToolHandlers({ store });

    const updated = await handlers.resolveComment({ id: comments[0]!.id, sha: HEAD });
    expect(updated.status).toBe("resolved");
  });

  it("does not fail the resolve when the gate itself does", async () => {
    const { store, comments } = await seeded(1);
    const angry = {
      name: "angry",
      publish: () => Promise.reject(new Error("the forge said no")),
    };
    const handlers = createToolHandlers({ store, gate: angry });

    const updated = await handlers.resolveComment({ id: comments[0]!.id, sha: HEAD });
    expect(updated.status).toBe("resolved");
  });
});
