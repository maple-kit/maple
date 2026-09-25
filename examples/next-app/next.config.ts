import { withMaple } from "@maple-kit/core/next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

import type { NextConfig } from "next";

// Preview builds tag; every other build strips. `withMaple` is what makes that
// one flag rather than two settings that can silently disagree — a rule that
// adds the attributes and a pass that takes them away again.
const preview = process.env["MAPLE_PREVIEW"] === "1";

// Verification only, and the reason this file has three modes rather than two:
// a production build does not tag at all, so asserting it is clean proves only
// that nothing happened. This mode tags *and* strips, which is what actually
// exercises reactRemoveProperties. See scripts/verify.ts.
const stripCheck = process.env["MAPLE_STRIP_CHECK"] === "1";

function distDir(): string {
  if (preview) return ".next-preview";
  return stripCheck ? ".next-strip" : ".next";
}

// Maple Mock is in a preview build and in `next dev`, and in no other build.
// Inlined into client code, so `instrumentation-client.ts` is dropped without it.
function baseFor(phase: string): NextConfig {
  const mockable = preview || phase === PHASE_DEVELOPMENT_SERVER;
  return {
    distDir: distDir(),
    env: { MAPLE_MOCK: mockable ? "1" : "" },
    // The workspace tsconfig maps packages to source, and Turbopack cannot map
    // its `.js` specifiers to `.ts`. A host gets the built package; so does this.
    turbopack: {
      resolveAlias: {
        "@maple-kit/mock": "../../packages/mock/dist/index.js",
        "@maple-kit/core/mock": "../../packages/core/dist/mock/index.js",
      },
    },
  };
}

export default function config(phase: string): NextConfig {
  const base = baseFor(phase);
  const tagging = withMaple(base, { preview: true });
  const stripping = withMaple(base, { preview: false });
  if (!stripCheck) return preview ? tagging : stripping;

  // The one build that does both, spelled out here because `withMaple` will not
  // produce it: taking the tagging half of one and the stripping half of the
  // other is exactly the mistake it exists to make impossible by accident.
  return {
    ...stripping,
    ...(tagging.turbopack === undefined ? {} : { turbopack: tagging.turbopack }),
  };
}
