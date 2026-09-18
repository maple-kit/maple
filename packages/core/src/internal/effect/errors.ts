/**
 * Typed failures for store operations.
 *
 * These are Effect tagged errors because core matches on them internally. They
 * become a MapleStoreError before they cross a public boundary.
 */

import { Data } from "effect";

/** The backend could not be reached, or answered with a retryable status. */
export class StoreUnavailable extends Data.TaggedError("StoreUnavailable")<{
  readonly connector: string;
  readonly operation: string;
  readonly cause: unknown;
}> {}

/** The connector answered, but rejected the request; retrying will not help. */
export class StoreRejected extends Data.TaggedError("StoreRejected")<{
  readonly connector: string;
  readonly operation: string;
  readonly cause: unknown;
}> {}
