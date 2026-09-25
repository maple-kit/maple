import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { jevClassifier } from "@maple-kit/classifier";
import { createCommentStore, keywordClassifier } from "@maple-kit/core";
import { memoryMedia, memoryStore } from "@maple-kit/core/testing";
import { maple } from "@maple-kit/core/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { AUDIT, LD_FLAGS, ROWS } from "./src/app/data.js";
import { SEEDED_FRAMES } from "./src/app/frames.js";
import { seedComments } from "./src/app/seed.js";

import type { CommentStore } from "@maple-kit/core";
import type { MediaConnector } from "@maple-kit/core/connectors";
import type { Connect, Plugin } from "vite";

/** A path inside this repository, for the workspace aliases below. */
function here(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

/**
 * The workspace packages resolve to source, not to the `dist` their `exports`
 * name: without this the dev server serves whatever was last built.
 */
const alias = [
  { find: /^@maple-kit\/core$/, replacement: here("../../packages/core/src/index.ts") },
  { find: /^@maple-kit\/core\/(.*)$/, replacement: here("../../packages/core/src/$1/index.ts") },
  { find: /^@maple-kit\/mock$/, replacement: here("../../packages/mock/src/index.ts") },
  { find: /^@maple-kit\/mock\/(.*)$/, replacement: here("../../packages/mock/src/$1/index.ts") },
  { find: /^@maple-kit\/react$/, replacement: here("../../packages/react/src/index.ts") },
  { find: /^@maple-kit\/react\/(.*)$/, replacement: here("../../packages/react/src/$1/index.ts") },
  { find: /^@maple-kit\/ui$/, replacement: here("../../packages/ui/src/index.ts") },
  { find: /^@maple-kit\/ui\/maple$/, replacement: here("../../packages/ui/src/maple.ts") },
  { find: /^@maple-kit\/ui\/(.*)$/, replacement: here("../../packages/ui/src/$1/index.ts") },
];

/** Store and blobs, both in memory and both seeded. The screenshots go in
 * through the same putBlob a capture uses, so the demo exercises the real path. */
async function seeded(branch: string): Promise<{ store: CommentStore; media: MediaConnector }> {
  const media = memoryMedia();
  const shots = await Promise.all(
    SEEDED_FRAMES.map((svg) =>
      media.putBlob({ data: new TextEncoder().encode(svg), contentType: "image/svg+xml" }),
    ),
  );

  const store = createCommentStore(memoryStore());
  for (const comment of seedComments(branch, shots)) await store.append(comment);
  return { store, media };
}

/**
 * The page's own API, answered from `data.ts`: what a real app would fetch.
 * `/ld/…` stands in for LaunchDarkly's flag poll, so the example needs no key.
 */
const API: Readonly<Record<string, unknown>> = {
  "GET /api/reviews": { items: ROWS, total: ROWS.length, nextCursor: null },
  "GET /api/session": { name: "Ada", tint: 0, role: "owner", permissions: ["settings.write"] },
  "GET /api/audit": { items: AUDIT },
  "POST /api/settings": null,
};

const LD_POLL = /^\/ld\/sdk\/evalx\/[^/]+\/contexts\/[^/]+$/;

const answerApi: Connect.NextHandleFunction = (request, response, next) => {
  const path = request.url?.split("?")[0] ?? "";
  const key = `${request.method ?? "GET"} ${path}`;
  const body = request.method === "GET" && LD_POLL.test(path) ? LD_FLAGS : API[key];
  if (body === undefined) return next();
  if (body === null) {
    response.statusCode = 204;
    return response.end();
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
};

/** Mounts the page's API on the dev and preview servers. */
function exampleApi(): Plugin {
  return {
    name: "example-api",
    configureServer: (server) => void server.middlewares.use(answerApi),
    configurePreviewServer: (server) => void server.middlewares.use(answerApi),
  };
}

const BRANCH = process.env["VITE_MAPLE_BRANCH"] ?? "feat/example";

function openapi(): unknown {
  return JSON.parse(readFileSync(here("openapi.json"), "utf8"));
}

export default defineConfig(async ({ command, isPreview, mode }) => {
  // Read here, in the config, which runs in Node. The empty prefix is what
  // makes `loadEnv` return unprefixed names, and only `VITE_` ones reach
  // client code, so the key cannot land in the bundle. Absent, `/assist`
  // answers 404 and the composer is what it is today.
  const env = loadEnv(mode, import.meta.dirname, "");
  const apiKey = env["TYPESAFE_API_KEY"];
  const model = env["MAPLE_AI_MODEL"];
  const baseUrl = env["MAPLE_AI_API"];
  const classifier = apiKey
    ? jevClassifier({ apiKey, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) })
    : undefined;

  // On for a preview build and off everywhere else, so a production build is
  // correct even when the flag is forgotten. `vite dev` is a preview of a
  // preview. `vite preview` runs as "serve" too, and is one only when its build was.
  const preview = process.env["MAPLE_PREVIEW"] === "1" || (command === "serve" && !isPreview);

  const { media, store } = await seeded(BRANCH);

  return {
    resolve: { alias },
    define: { __MAPLE_PREVIEW__: JSON.stringify(preview) },
    plugins: [
      react(),
      exampleApi(),
      maple({
        tagger: preview,
        root: import.meta.dirname,
        // Only the dev and preview servers mount this; a static build has no
        // server, so a deployed copy hosts the route elsewhere. In memory and
        // seeded, so a restart is a clean slate with something in it.
        route: {
          store,
          media,
          ...(classifier ? { assist: { classifier } } : {}),
          // The page's API, described for Maple Mock; served per call, never
          // bundled. A sentence is planned by the model when it can plan.
          mock: {
            preview,
            schemas: [{ codec: "rest", document: openapi() }],
            // Who the page is told the reviewer is, for a recipe's `as`. The
            // role and permission words come from the session's own schema.
            identity: {
              call: "rest:GET /api/session",
              role: { path: "role" },
              permissions: { path: "permissions" },
              requires: { "rest:GET /api/audit": { roles: ["owner"] } },
            },
            plan: { classifier: classifier?.plan ? classifier : keywordClassifier() },
          },
        },
      }),
    ],
    build: {
      outDir: process.env["MAPLE_PREVIEW"] === "1" ? "dist-preview" : "dist",
      // The overlay's page, and the same page with the mock box alone.
      rolldownOptions: { input: { main: here("index.html"), mock: here("mock.html") } },
    },
  };
});
