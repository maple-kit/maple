/**
 * Proves the two claims this example exists to make: the tagger runs on a
 * preview build, and a production build carries nothing the tagger emitted.
 *
 * Since the example mounts the overlay, the bare strings `data-maple-src` and
 * `data-maple-name` are in both bundles — the anchor reads those attributes to
 * name a target, so `@maple-kit/ui` names them whatever the tagger did. What
 * separates the two builds is the *emitted* form: a JSX prop, quoted and
 * followed by a colon, which only a tagged element has.
 */

/** The attribute as the tagger writes it into a build, not as the anchor reads it. */
function emitted(attribute: string): string {
  return `"${attribute}":`;
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "vite";

/** The example itself, not this script's directory. */
const HERE = join(import.meta.dirname, "..");

async function buildInto(directory: string, preview: boolean): Promise<string> {
  process.env["MAPLE_PREVIEW"] = preview ? "1" : "";
  await build({ root: HERE, logLevel: "warn" });
  return join(HERE, directory);
}

async function contentsOf(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const read = files.map((entry) => readFile(join(entry.parentPath, entry.name), "utf8"));
  return (await Promise.all(read)).join("\n");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    process.exitCode = 1;
    throw new Error(message);
  }
}

const previewOutput = await contentsOf(await buildInto("dist-preview", true));
assert(
  previewOutput.includes(emitted("data-maple-src")),
  "A preview build should carry data-maple-src on a tagged element, and does not.",
);
assert(
  previewOutput.includes("src/App.tsx:"),
  "A preview build should carry the source path the tagger emitted, and does not.",
);
assert(
  previewOutput.includes(emitted("data-maple-name")),
  "A preview build should carry data-maple-name on a tagged element, and does not.",
);

const productionOutput = await contentsOf(await buildInto("dist", false));
assert(
  !productionOutput.includes(emitted("data-maple-src")),
  "A production build must tag no element with data-maple-src, and this one does.",
);
assert(
  !productionOutput.includes(emitted("data-maple-name")),
  "A production build must tag no element with data-maple-name, and this one does.",
);
assert(
  !productionOutput.includes("src/App.tsx:"),
  "A production build must leak no source path, and this one does.",
);

process.stdout.write("vite-app: tagged on preview, clean in production.\n");
