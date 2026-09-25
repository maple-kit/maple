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
import { dirname, join, normalize } from "node:path";

import { build } from "vite";

/**
 * Written only by `@mswjs/interceptors`, so it marks the transport. The box's
 * own code is in both builds, since `<Maple />` carries it; the transport is not.
 */
const INTERCEPTOR = "fetch-interceptor";

/**
 * The pattern Maple's LaunchDarkly flag source claims the SDK's poll by. The
 * SDK itself builds the path from parts, so only the flag source writes it.
 */
const FLAG_SOURCE = "evalx\\/[^/]+\\/(?:contexts";

/** Written only in `openapi.json`, which the route serves and no bundle may carry. */
const SCHEMA_MARK = "Supplied to Maple Mock by vite.config.ts; never bundled.";

/** Rules only the island's, the composer's and the marks' stylesheets write. */
const OTHER_PARTS = [".mk-island {", ".mk-composer {", ".mk-marks {"];

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

/** Every script a page loads, following each chunk's static imports. */
async function pageScripts(directory: string, html: string): Promise<string> {
  const page = await readFile(join(directory, html), "utf8");
  const queue = [...page.matchAll(/(?:src|href)="\/([^"]+\.js)"/g)].map((match) => match[1]!);
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = await readFile(join(directory, file), "utf8");
    for (const [, specifier] of code.matchAll(/from\s*"(\.\/[^"]+\.js)"/g)) {
      queue.push(normalize(join(dirname(file), specifier!)));
    }
  }
  const read = [...seen].map((file) => readFile(join(directory, file), "utf8"));
  return (await Promise.all(read)).join("\n");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    process.exitCode = 1;
    throw new Error(message);
  }
}

const previewDirectory = await buildInto("dist-preview", true);
const previewOutput = await contentsOf(previewDirectory);
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

assert(
  previewOutput.includes(INTERCEPTOR),
  "A preview build should carry Maple Mock's interceptor, and does not.",
);

assert(
  previewOutput.includes(FLAG_SOURCE),
  "A preview build should carry Maple's LaunchDarkly flag source, and does not.",
);

assert(
  !previewOutput.includes(SCHEMA_MARK),
  "A preview build must not carry the page's schema, which the route serves per call.",
);

const mockOnly = await pageScripts(previewDirectory, "mock.html");
assert(
  mockOnly.includes(".mk-mock-banner {") && mockOnly.includes(INTERCEPTOR),
  "The mock-only page should carry the box and the interceptor, and does not.",
);
for (const part of OTHER_PARTS) {
  assert(
    !mockOnly.includes(part),
    `The mock-only page must carry none of the review overlay, and carries ${part}.`,
  );
}

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

assert(
  !productionOutput.includes(SCHEMA_MARK),
  "A production build must not carry the page's schema, and this one does.",
);
assert(
  !productionOutput.includes(INTERCEPTOR),
  "A production build must carry no Maple Mock interceptor, and this one does.",
);

assert(
  !productionOutput.includes(FLAG_SOURCE),
  "A production build must not rewrite LaunchDarkly's flags, and carries the flag source.",
);

process.stdout.write(
  "vite-app: tagged and mockable on preview, clean in production, and a mock-only page.\n",
);
