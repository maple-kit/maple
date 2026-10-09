/**
 * The bundle budget, asserted at build time.
 *
 * It runs as the second half of this package's `build`, so the CI build job
 * enforces it. It measures this package's own emitted modules only.
 *
 * The stylesheet is weighed first, on its own: the overlay adopts one sheet,
 * so charging its rules to whichever column reached them first moved the
 * component columns whenever a rule was added elsewhere.
 */

import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** The mock box alone, which is also what a page with no `<Maple />` carries. */
const MOCK_MAX = 4 * 1024;

/** Each budget is the gzipped size of the modules only that column reaches. */
const BUDGETS = [
  // 13 KB until the score card; 14 KB until the mock box, whose rules ride in
  // this sheet so Maple.Mock needs no second one inside <Maple /> (a page that
  // only mocks adopts MOCK_CSS, weighed below); 16 KB once its menu joined;
  // 17 KB for the popup and sign-in; 17.5 KB for the resize handles.
  { name: "the adopted stylesheet", entries: ["stylesheet.js"], max: 17.5 * 1024 },
  // 22 KB until the wordmark; 24 KB for the sign-off and unsent list; 26 KB
  // for the pixel leaf (docs/branding.md); 28, 29 KB for drafts; 30 KB import
  // and export; 31 KB solo; 32 KB the shared popup; 35 KB for the resizable
  // card and the edge indicators.
  {
    name: "root + marks + island + icons",
    entries: ["index.js", "marks/index.js", "island/index.js", "icons/index.js"],
    max: 35 * 1024,
  },
  // 9 KB until the score card. The extra 1 KB is the card, the kind control
  // and the context card's disclosure. Every byte of it is inert on a
  // deployment with no classifier configured, which is the default.
  { name: "composer, on top", entries: ["composer/index.js"], max: 10 * 1024 },
  { name: "picker, on top", entries: ["picker/index.js"], max: 3 * 1024 },
  { name: "notice, on top", entries: ["notice/index.js"], max: 1024 },
  { name: "the mock box, on top", entries: ["mock/index.js"], max: MOCK_MAX },
  // Loaded by the box only on a page with evaluated flags or identity rules;
  // 2.5 KB once it read real values and folded long lists.
  {
    name: "the box's flags and identity, loaded later",
    entries: ["mock/layers.js"],
    max: 2.5 * 1024,
  },
  // 1 KB until the sign-in steps and the linked branch chip joined it.
  { name: "the default composition, on top", entries: ["maple.js"], max: 1.5 * 1024 },
];

// Static imports only: a dynamic `import("./x.js")` is a chunk loaded later,
// weighed as an entry of its own rather than charged to whoever loads it.
const RELATIVE_IMPORT = /(?:from|import)\s+["'](\.[^"']+)["']/g;
const LAZY_IMPORT = /import\(\s*["'](\.[^"']+)["']\s*\)/g;
const PACKAGE_IMPORT = /(?:from|import)[\s(]+["']([^."'][^"']*)["']/g;

/**
 * What an entry must never reach: the box carries no other part, and the
 * composition, which carries the box, never imports the interceptor.
 */
const FORBIDDEN = [
  {
    entry: "mock/index.js",
    modules: /^(island|composer|marks|picker)\//,
    packages: /^$/,
    max: 8.5 * 1024,
  },
  {
    entry: "maple.js",
    modules: /^$/,
    packages: /^(@mswjs\/interceptors|@maple-kit\/mock|@maple-kit\/mock\/(install|msw|node))$/,
  },
];

function read(id) {
  return readFileSync(join(DIST, id), "utf8");
}

/** Every module reachable from an entry by a relative import, the entry included. */
function graph(entries) {
  const seen = new Set();
  const queue = [...entries];

  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);

    const source = read(id);
    for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
      queue.push(normalize(join(dirname(id), specifier)));
    }
  }
  return seen;
}

/** Gzipped bytes of the modules, concatenated in a stable order. */
function weigh(ids) {
  const sorted = [...ids].sort();
  return gzipSync(sorted.map(read).join("\n"), { level: 9 }).byteLength;
}

/** Every bare specifier the modules import. */
function packagesOf(ids) {
  return new Set([...ids].flatMap((id) => [...read(id).matchAll(PACKAGE_IMPORT)].map((m) => m[1])));
}

let failed = false;

// Every lazy chunk must be one a budget names, or it would be weighed nowhere.
const budgeted = new Set(BUDGETS.flatMap((budget) => budget.entries));
for (const id of graph(BUDGETS.flatMap((budget) => budget.entries))) {
  for (const [, specifier] of read(id).matchAll(LAZY_IMPORT)) {
    const lazy = normalize(join(dirname(id), specifier));
    if (budgeted.has(lazy)) continue;
    failed = true;
    process.stderr.write(`${id} loads ${lazy} later, and no budget weighs it\n`);
  }
}

for (const rule of FORBIDDEN) {
  const modules = graph([rule.entry]);
  const reached = [
    ...[...modules].filter((id) => rule.modules.test(id)),
    ...[...packagesOf(modules)].filter((name) => rule.packages.test(name)),
  ];
  const bytes = weigh(modules);
  const kb = (bytes / 1024).toFixed(1);
  if (reached.length > 0) {
    failed = true;
    process.stderr.write(`${rule.entry} reaches what it must not: ${reached.sort().join(", ")}\n`);
  } else if (rule.max !== undefined && bytes > rule.max) {
    failed = true;
    process.stderr.write(`${rule.entry}: ${kb} KB gzipped alone, over ${rule.max / 1024} KB\n`);
  } else {
    process.stdout.write(`${rule.entry}: ${kb} KB gzipped with everything it reaches, clean\n`);
  }
}

const counted = new Set();

for (const budget of BUDGETS) {
  const own = new Set([...graph(budget.entries)].filter((id) => !counted.has(id)));
  for (const id of own) counted.add(id);

  const bytes = weigh(own);
  const kb = (bytes / 1024).toFixed(1);
  const limit = (budget.max / 1024).toFixed(0);

  if (bytes > budget.max) {
    failed = true;
    process.stderr.write(`${budget.name}: ${kb} KB gzipped, over the ${limit} KB budget\n`);
    process.stderr.write(`  ${own.size} modules: ${[...own].sort().join(", ")}\n`);
  } else {
    process.stdout.write(`${budget.name}: ${kb} KB gzipped, under ${limit} KB\n`);
  }
}

if (failed) {
  process.stderr.write("The budget is in packages/ui/scripts/size.js. Raising it is a decision.\n");
  process.exit(1);
}
