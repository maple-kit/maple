import { afterAll, afterEach, beforeAll } from "vitest";

import { githubStore } from "../src/connectors/github.js";
import { runStoreContract } from "../src/testing/store-contract.js";
import { createGitHubFake } from "./msw/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

const github = createGitHubFake();
const server = createTestServer(...github.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });

runStoreContract({
  name: "github",
  create: () =>
    Promise.resolve({
      connector: githubStore({ owner: "maple-kit", repo: "app", token: "test-token" }),
      cleanup: () => {
        github.reset();
        return Promise.resolve();
      },
    }),
});
