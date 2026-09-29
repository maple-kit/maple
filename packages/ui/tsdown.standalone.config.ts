import { defineConfig } from "tsdown";

/**
 * The overlay bundled with React, as a classic script `maple review` serves.
 * A second config, not a second entry of the first: that one keeps every module
 * separate and its dependencies external, and this is the opposite on both.
 */
export default defineConfig({
  entry: { standalone: "src/standalone.ts" },
  format: ["iife"],
  platform: "browser",
  target: "es2023",
  dts: false,
  clean: false,
  minify: true,
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
