/**
 * Maple's route, mounted for Maple Mock alone: no store, so the comment
 * endpoints answer 404, and `/mock/schema` serves the router's shapes on a
 * preview build and `next dev`.
 *
 * `.maple/schema.json` is a preview build artifact: `pnpm schema` writes it
 * from `server/router.ts` before the build. Missing, the route has no shapes.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

const handler = createMapleHandler({ mock: { preview: process.env.MAPLE_MOCK === "1", schemas } });

export { handler as GET };
