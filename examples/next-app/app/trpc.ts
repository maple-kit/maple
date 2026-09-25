/**
 * The page's tRPC client: a streamed batch for queries and mutations, and
 * server-sent events for the subscription, as production apps set it up. The
 * session call has a request of its own, so a held batch never holds it.
 */

import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "../server/router";

const url = "/api/trpc";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({ url, transformer: superjson }),
      false: splitLink({
        condition: (op) => op.path === "user.me",
        true: httpBatchStreamLink({ url, transformer: superjson }),
        false: httpBatchStreamLink({ url, transformer: superjson }),
      }),
    }),
  ],
});
