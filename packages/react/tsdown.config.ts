import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/mock/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  target: "es2023",
  outputOptions: { comments: { annotation: true, jsdoc: false, legal: true } },
});
