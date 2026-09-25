/**
 * Maple's route, mounted for Maple Mock alone: no store, so the comment
 * endpoints answer 404. On a preview build and `next dev`, `/mock/schema`
 * serves the router's shapes and `/mock/plan` reads a sentence, offline.
 *
 * `.maple/schema.json` is a preview build artifact: `pnpm schema` writes it
 * from `server/router.ts` before the build. Missing, the route has no shapes.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { keywordClassifier } from "@maple-kit/core/connectors";
import { readSchemaDocument } from "@maple-kit/core/mock";
import { createMapleHandler } from "@maple-kit/core/route";

async function schemas() {
  try {
    const text = await readFile(join(process.cwd(), ".maple", "schema.json"), "utf8");
    return [readSchemaDocument(JSON.parse(text))];
  } catch {
    return [];
  }
}

const handler = createMapleHandler({
  mock: {
    preview: process.env.MAPLE_MOCK === "1",
    schemas,
    plan: { classifier: keywordClassifier() },
    // Who the page is told the reviewer is, for a recipe's `as`. The roles come
    // from `user.me`'s own output type; a viewer's create answers 403.
    identity: {
      call: "trpc:user.me",
      role: { path: "role" },
      requires: { "trpc:project.create": { roles: ["owner", "member"] } },
    },
  },
});

export { handler as GET, handler as POST };
