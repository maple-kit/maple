import type { NextConfig } from "next";

// Preview builds tag; every other build strips. One flag drives both halves,
// so there is no configuration in which the tagger runs and the stripping
// does not.
const preview = process.env["MAPLE_PREVIEW"] === "1";

// Verification only, and the reason this file has three modes rather than two:
// a production build does not tag at all, so asserting it is clean proves only
// that nothing happened. This mode tags *and* strips, which is what actually
// exercises reactRemoveProperties. See scripts/verify.ts.
const stripCheck = process.env["MAPLE_STRIP_CHECK"] === "1";

const TAGGER = { "*.tsx": { loaders: ["@maple-kit/core/loader"] } };

function distDir(): string {
  if (preview) return ".next-preview";
  return stripCheck ? ".next-strip" : ".next";
}

const config: NextConfig = {
  distDir: distDir(),
  turbopack: { rules: preview || stripCheck ? TAGGER : {} },
  compiler: {
    reactRemoveProperties: preview ? false : { properties: ["^data-maple-"] },
  },
};

export default config;
