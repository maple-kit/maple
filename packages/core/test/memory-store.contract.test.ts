import { memoryStore } from "../src/testing/memory-store.js";
import { runStoreContract } from "../src/testing/store-contract.js";

/**
 * The reference connector runs the same suite every contributed connector runs.
 * If this file fails, the contract itself is broken, not a backend.
 */
runStoreContract({
  name: "memory",
  create: () => Promise.resolve({ connector: memoryStore() }),
});

runStoreContract({
  name: "memory-append-only",
  create: () => Promise.resolve({ connector: memoryStore({ name: "memory", appendOnly: true }) }),
});
