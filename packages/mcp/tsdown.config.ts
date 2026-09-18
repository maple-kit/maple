import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts", "src/stop-hook-bin.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  target: "node22",
});
