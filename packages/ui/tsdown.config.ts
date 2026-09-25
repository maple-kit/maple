import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/maple.ts",
    "src/composer/index.ts",
    "src/icons/index.ts",
    "src/island/index.ts",
    "src/marks/index.ts",
    "src/mock/index.ts",
    "src/notice/index.ts",
    "src/picker/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  target: "es2023",
  outputOptions: { comments: { annotation: true, jsdoc: false, legal: true } },
});
