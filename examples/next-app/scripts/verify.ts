/**
 * Proves the tagger runs on a preview build, and that stripping reaches the
 * server bundle and not only the client one.
 *
 * The third build is the one that matters. A production build never runs the
 * tagger, so finding it clean proves only that nothing happened; the
 * strip-check build tags *and* strips, which is what exercises
 * reactRemoveProperties. A stripped client with an unstripped server is the
 * failure that looks like success.
 */

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = join(import.meta.dirname, "..");
const ATTRIBUTE = "data-maple-";
/** Written into a bundle only by the recipe reader, so it marks Maple Mock's presence. */
const RECIPE_PARAM = "maple-mock";

interface Bundles {
  readonly client: string;
  readonly server: string;
}

async function buildWith(flags: Record<string, string>, directory: string): Promise<Bundles> {
  await run("next", ["build"], {
    cwd: HERE,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...flags },
    maxBuffer: 32 * 1024 * 1024,
  });

  const out = join(HERE, directory);
  return {
    client: await contentsOf(join(out, "static")),
    server: await contentsOf(join(out, "server")),
  };
}

async function contentsOf(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter(
    (entry) => entry.isFile() && /\.(js|mjs|html|json|rsc|segment)$/.test(entry.name),
  );
  const read = files.map((entry) => readFile(join(entry.parentPath, entry.name), "utf8"));
  return (await Promise.all(read)).join("\n");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    process.exitCode = 1;
    throw new Error(message);
  }
}

const tagged = await buildWith({ MAPLE_PREVIEW: "1" }, ".next-preview");
assert(
  tagged.server.includes(ATTRIBUTE),
  "A preview build should tag the server bundle, and does not.",
);
assert(
  tagged.client.includes(ATTRIBUTE),
  "A preview build should tag the client bundle, and does not.",
);

assert(
  tagged.client.includes(RECIPE_PARAM),
  "A preview build should carry Maple Mock's interceptor, and does not.",
);

const stripped = await buildWith({ MAPLE_STRIP_CHECK: "1" }, ".next-strip");
assert(
  !stripped.client.includes(ATTRIBUTE),
  "reactRemoveProperties left a Maple attribute in the client bundle.",
);
assert(
  !stripped.server.includes(ATTRIBUTE),
  "reactRemoveProperties left a Maple attribute in the SERVER bundle. " +
    "A stripped client with an unstripped server is the failure that looks like success.",
);

const production = await buildWith({}, ".next");
assert(
  !production.client.includes(ATTRIBUTE) && !production.server.includes(ATTRIBUTE),
  "A production build must carry no Maple attribute, and this one does.",
);
assert(
  !production.client.includes(RECIPE_PARAM) && !production.server.includes(RECIPE_PARAM),
  "A production build must carry no Maple Mock interceptor, and this one does.",
);

process.stdout.write(
  "next-app: tagged and mockable on preview, stripped from both bundles, clean in production.\n",
);
