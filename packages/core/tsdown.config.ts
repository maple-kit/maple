import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/anchor/index.ts",
    "src/auth/index.ts",
    "src/client/index.ts",
    "src/connectors/index.ts",
    "src/export/index.ts",
    "src/gate/index.ts",
    "src/loader/index.ts",
    "src/next/index.ts",
    "src/logger/index.ts",
    "src/vite/index.ts",
    "src/config/index.ts",
    "src/overlay/index.ts",
    "src/route/index.ts",
    "src/screenshot/index.ts",
    "src/tagger/index.ts",
    "src/testing/index.ts",
  ],
  // `/testing` imports describe/it/expect. Without this, unbundle copies
  // vitest into dist/ and the contract suite registers against that copy
  // rather than the consumer's runner. Declared as an optional peer instead.
  external: ["vitest"],
  format: ["esm"],
  dts: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  target: "node24",
  outputOptions: { comments: { annotation: true, jsdoc: false, legal: true } },
});
