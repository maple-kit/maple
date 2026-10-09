/**
 * The `cause` chain under a logged error, one "Caused by:" line per link.
 * A store's own message is generic on purpose; the reason is in its cause.
 */

const MAX_DEPTH = 5;

function describe(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  try {
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return String(cause);
  }
}

/** Empty when the error has no cause, so a sink can append it unconditionally. */
export function causeChain(error: Error): string {
  let lines = "";
  let cause: unknown = error.cause;
  for (let depth = 0; cause !== undefined && depth < MAX_DEPTH; depth += 1) {
    lines += `\nCaused by: ${describe(cause)}`;
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines;
}
