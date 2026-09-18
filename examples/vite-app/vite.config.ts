import { maple } from "@maple-kit/core/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The tagger is on for a preview build and off everywhere else, so a
// production build is correct even when the flag is forgotten.
const preview = process.env["MAPLE_PREVIEW"] === "1";

export default defineConfig({
  plugins: [react(), maple({ tagger: preview, root: import.meta.dirname })],
  build: { outDir: preview ? "dist-preview" : "dist" },
});
