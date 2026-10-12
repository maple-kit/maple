/**
 * The design-lint labels were written before any model saw them, and
 * README.md says they are never revised after a run. This is the lock: it
 * fails when `cases.json` changes at all, so a revision is a decision made in
 * this file's diff, in review, rather than a quiet edit beside a score.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** sha256 of `evals/cases/design-lint/cases.json`, committed before the first jev run. */
const FROZEN_SHA256 = "7c7090f5e50e0e016524657d44cc2b8e70f2ab10a35451e89985121280456030";

describe("design-lint · the labels are frozen", () => {
  it("has not changed since the labels were committed", () => {
    const bytes = readFileSync(new URL("./cases/design-lint/cases.json", import.meta.url));

    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FROZEN_SHA256);
  });
});
