/**
 * The writes a page sent to the server while a recipe's `as` was on. The
 * server acted as the reviewer for each, whatever the page was shown, so a
 * surface says how many there were rather than letting them pass unseen.
 */

/** Every call a write sent under `as`, in order, and who to tell. */
export interface WriteLog {
  list(): readonly string[];
  /** Called after every write. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** A log with its writer, which only the interceptor holds. */
export function createWriteLog(): WriteLog & { add(key: string): void } {
  const keys: string[] = [];
  const listeners = new Set<() => void>();
  return {
    add(key) {
      keys.push(key);
      for (const listener of [...listeners]) listener();
    },
    list: () => [...keys],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
