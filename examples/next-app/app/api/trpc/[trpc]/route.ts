import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "../../../../server/router";

function handler(request: Request): Promise<Response> {
  return fetchRequestHandler({ endpoint: "/api/trpc", req: request, router: appRouter });
}

export { handler as GET, handler as POST };
