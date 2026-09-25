import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client/index.ts",
    "src/install.ts",
    "src/launchdarkly/index.ts",
    "src/msw/index.ts",
    "src/node/index.ts",
    "src/openfeature/index.ts",
    "src/testing/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  target: "es2023",
  outputOptions: { comments: { annotation: true, jsdoc: false, legal: true } },
});
