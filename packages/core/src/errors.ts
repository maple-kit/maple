/** The public form of a store failure, thrown by everything in {@link CommentStore}. */
export class MapleStoreError extends Error {
  override readonly name = "MapleStoreError";

  constructor(
    /** Whether another attempt could succeed. */
    readonly reason: "rejected" | "unavailable",
    readonly connector: string,
    readonly operation: string,
    override readonly cause: unknown,
  ) {
    super(`Store "${connector}" failed during ${operation} (${reason}).`);
  }
}
