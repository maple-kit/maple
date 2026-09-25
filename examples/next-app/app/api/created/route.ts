import { createdCount } from "../../../server/router";

/** How many creates reached the server: the check that a mocked one did not. */
export function GET(): Response {
  return Response.json({ created: createdCount() });
}

export const dynamic = "force-dynamic";
