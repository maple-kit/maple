/**
 * Creates a GitHub Release for each published package version that lacks one,
 * with that version's section of the package's CHANGELOG.md as the notes.
 * Run as `node tools/github-releases/release.ts [--tag <tag>]...`; with no
 * flag it takes every `@maple-kit/*` tag at HEAD, and `--backfill-latest`
 * takes each package's current version instead. A tag that already has a
 * release is skipped, so a rerun is harmless. Only core's release is marked
 * latest, which is what the repository sidebar shows.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package whose release the repository sidebar shows as latest. */
export const LATEST_PACKAGE = "@maple-kit/core";

/** Runs a command and returns its stdout; `input` goes to its stdin. */
export type Run = (command: string, args: string[], input?: string) => string;

/** The body of the `## <version>` section of a changelog, or undefined. */
export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === `## ${version}`);
  if (start === -1) return undefined;
  const length = lines.slice(start + 1).findIndex((line) => line.startsWith("## "));
  const end = length === -1 ? lines.length : start + 1 + length;
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/** Splits `@maple-kit/core@0.17.1` into its name and version. */
export function parseTag(tag: string): { name: string; version: string } | undefined {
  const at = tag.lastIndexOf("@");
  if (at <= 0) return undefined;
  return { name: tag.slice(0, at), version: tag.slice(at + 1) };
}

interface Manifest {
  dir: string;
  name: string;
  private: boolean;
  version: string;
}

/** Every packages/<dir>/package.json under `root`. */
export function manifests(root: string): Manifest[] {
  const found: Manifest[] = [];
  for (const entry of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    const file = join(root, "packages", entry.name, "package.json");
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8")) as Partial<Manifest>;
    found.push({
      dir: join("packages", entry.name),
      name: json.name ?? "",
      private: json.private === true,
      version: json.version ?? "",
    });
  }
  return found;
}

/** The `gh release create` arguments for `tag`, notes read from stdin. */
export function createArgs(tag: string, latest: boolean): string[] {
  return [
    "release",
    "create",
    tag,
    "--verify-tag",
    "--title",
    tag,
    "--notes-file",
    "-",
    latest ? "--latest" : "--latest=false",
  ];
}

interface Options {
  backfill: boolean;
  root: string;
  run: Run;
  tags: readonly string[];
}

/** The tags to release: the given ones, each current version, or those at HEAD. */
export function targetTags({ backfill, root, run, tags }: Options): string[] {
  if (tags.length > 0) return [...tags];
  if (backfill) {
    return manifests(root)
      .filter((pkg) => !pkg.private)
      .map((pkg) => `${pkg.name}@${pkg.version}`);
  }
  const out = run("git", ["tag", "--points-at", "HEAD", "--list", "@maple-kit/*"]);
  return out.split("\n").filter((tag) => tag !== "");
}

/** Creates the missing releases and returns the tags it created. */
export function createReleases(options: Options): string[] {
  const { root, run } = options;
  const listArgs = [
    "release",
    "list",
    "--limit",
    "1000",
    "--json",
    "tagName",
    "--jq",
    ".[].tagName",
  ];
  const existing = new Set(run("gh", listArgs).split("\n"));
  const dirs = new Map(manifests(root).map((pkg) => [pkg.name, pkg.dir]));
  const created: string[] = [];
  for (const tag of targetTags(options)) {
    const parsed = parseTag(tag);
    const dir = parsed === undefined ? undefined : dirs.get(parsed.name);
    if (parsed === undefined || dir === undefined) throw new Error(`${tag} is not a package tag.`);
    if (existing.has(tag)) continue;
    const changelog = readFileSync(join(root, dir, "CHANGELOG.md"), "utf8");
    const notes = changelogSection(changelog, parsed.version);
    if (notes === undefined)
      throw new Error(`${dir}/CHANGELOG.md has no section for ${parsed.version}.`);
    run("gh", createArgs(tag, parsed.name === LATEST_PACKAGE), notes);
    created.push(tag);
  }
  return created;
}

const defaultRun: Run = (command, args, input) =>
  execFileSync(command, args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });

function main(): void {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const argv = process.argv.slice(2);
  const tags = argv.flatMap((arg, i) => (arg === "--tag" ? [argv[i + 1] ?? ""] : []));
  const backfill = argv.includes("--backfill-latest");
  const created = createReleases({ backfill, root, run: defaultRun, tags });
  const lines = [`${created.length} release(s) created`, ...created.map((tag) => `  ${tag}`)];
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
