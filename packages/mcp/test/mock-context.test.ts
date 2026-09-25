import { createCommentStore } from "@maple-kit/core";
import { githubStore } from "@maple-kit/core/connectors";
import { decodeRecipe, RECIPE_PARAM } from "@maple-kit/core/mock";
import { memoryStore, SAMPLE_CONTEXT, sampleComment } from "@maple-kit/core/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createGitHubFake } from "../../core/test/msw/github.js";
import { createTestServer, useTestServer } from "../../core/test/msw/server.js";
import { createToolHandlers } from "../src/handlers.js";

import type { Recipe } from "@maple-kit/core/mock";

const RECIPE: Recipe = {
  version: 2,
  calls: [
    { key: "trpc:roast.list", state: "empty" },
    { key: "trpc:roast.count", state: "empty" },
  ],
  route: "/dashboard",
  request: "no roasts yet",
};

const github = createGitHubFake();
const server = createTestServer(...github.handlers);
useTestServer(server, { beforeAll, afterEach, afterAll });
afterEach(() => github.reset());

describe("get_comment_context, for a comment written under a mock", () => {
  it("gives back the recipe identical, over the GitHub ledger, with a link that replays it", async () => {
    const branch = "feature/mocked";
    const store = createCommentStore(githubStore({ owner: "maple-kit", repo: "app", token: "t" }));
    const stored = await store.append(
      sampleComment({ branch, context: { ...SAMPLE_CONTEXT, mock: RECIPE } }),
    );

    const context = await createToolHandlers({ store }).getCommentContext({
      id: stored.id,
      branch,
    });

    expect(context.mock?.recipe).toEqual(RECIPE);
    const replay = new URL(context.mock?.replay ?? "");
    expect(replay.origin + replay.pathname).toBe(SAMPLE_CONTEXT.url);
    expect(decodeRecipe(replay.searchParams.get(RECIPE_PARAM) ?? "")).toEqual(RECIPE);
    expect(context.conditions).toContain(
      'mocked: trpc:roast.list empty, trpc:roast.count empty ("no roasts yet")',
    );
  });

  it("names the flags and the identity it was written under", async () => {
    const store = createCommentStore(memoryStore());
    const mock: Recipe = {
      ...RECIPE,
      flags: { "new-roaster": true, tier: "gold" },
      as: { role: "barista", permissions: { "roast:delete": false } },
    };
    const stored = await store.append(
      sampleComment({ branch: "feature/as", context: { ...SAMPLE_CONTEXT, mock } }),
    );

    const context = await createToolHandlers({ store }).getCommentContext({
      id: stored.id,
      branch: "feature/as",
    });
    expect(context.conditions).toContain(
      'mocked: trpc:roast.list empty, trpc:roast.count empty; flags new-roaster=true, tier="gold"; ' +
        "as barista, without roast:delete (the page was told so; the server acted as the reviewer)",
    );
  });

  it("says nothing about a mock for a comment written without one", async () => {
    const store = createCommentStore(memoryStore());
    const stored = await store.append(sampleComment({ branch: "feature/plain" }));

    const context = await createToolHandlers({ store }).getCommentContext({
      id: stored.id,
      branch: "feature/plain",
    });
    expect(context.mock).toBeUndefined();
    expect(context.conditions).not.toContain("mocked");
  });
});
