import { defineConfig } from "vitest/config";

/**
 * Evals run on the vitest config the rest of the repository uses, so a scorer
 * and a test resolve modules the same way. `EVAL_IDS` and `EVAL_SAMPLES` are
 * read by the eval files themselves; see README.md.
 */
export default defineConfig({
  test: {
    include: ["**/*.eval.ts"],
    // A model call is slow and an eval may sample a case several times.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Cases are independent; concurrency is bounded by the provider, not here.
    fileParallelism: true,
  },
});
