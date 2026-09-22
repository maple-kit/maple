import { fileURLToPath } from "node:url";

import { createCommentStore } from "@maple-kit/core";
import { memoryMedia, memoryStore } from "@maple-kit/core/testing";
import { maple } from "@maple-kit/core/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { SEEDED_FRAMES } from "./src/app/frames.js";
import { seedComments } from "./src/app/seed.js";

import type { CommentStore } from "@maple-kit/core";
import type { MediaConnector } from "@maple-kit/core/connectors";

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
  { find: /^@maple-kit\/react$/, replacement: here("../../packages/react/src/index.ts") },
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

const BRANCH = process.env["VITE_MAPLE_BRANCH"] ?? "feat/example";

export default defineConfig(async ({ command }) => {
  // The tagger is on for a preview build and off everywhere else, so a
  // production build is correct even when the flag is forgotten. `vite dev`
  // is a preview of a preview, so it tags too — without the attributes there
  // is nothing on the page for a mark to anchor to.
  const preview = process.env["MAPLE_PREVIEW"] === "1" || command === "serve";

  const { media, store } = await seeded(BRANCH);

  return {
    resolve: { alias },
    plugins: [
      react(),
      maple({
        tagger: preview,
        root: import.meta.dirname,
        // Only the dev and preview servers mount this; a static build has no
        // server, so a deployed copy hosts the route elsewhere. In memory and
        // seeded, so a restart is a clean slate with something in it.
        route: { store, media },
      }),
    ],
    build: { outDir: process.env["MAPLE_PREVIEW"] === "1" ? "dist-preview" : "dist" },
  };
});
