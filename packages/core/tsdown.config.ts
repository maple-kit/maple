import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/anchor/index.ts",
    "src/auth/index.ts",
    "src/connectors/index.ts",
    "src/export/index.ts",
    "src/loader/index.ts",
    "src/logger/index.ts",
    "src/vite/index.ts",
    "src/config/index.ts",
    "src/overlay/index.ts",
    "src/route/index.ts",
    "src/screenshot/index.ts",
    "src/tagger/index.ts",
    "src/testing/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  target: "node22",
});
