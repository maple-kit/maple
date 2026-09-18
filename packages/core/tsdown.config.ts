import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/anchor/index.ts",
    "src/connectors/index.ts",
    "src/logger/index.ts",
    "src/config/index.ts",
    "src/overlay/index.ts",
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
