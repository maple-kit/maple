/**
 * Two small guards on the prose in every tracked Markdown file. A `0.x.y`
 * next to an `@maple-kit/*` name that is older than that package's newest
 * release tag is stale. A paragraph
 * of 40 words or more that repeats another in the same file, word for word
 * or nearly, is one edit that landed twice. IGNORE on a line exempts that
 * line's versions, and on the line above a paragraph exempts the paragraph.
 * Run it as `node tools/doc-guards/check.ts`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The marker that exempts a line, or the paragraph below it, on purpose. */
export const IGNORE = "<!-- doc-guards: ignore -->";
/** How far, in characters, a version may sit from the package it is about. */
export const NEAR = 60;
/** The shortest paragraph compared, in words. */
export const MIN_WORDS = 40;
/** Shared word-trigram fraction at or above which two paragraphs match. */
export const OVERLAP = 0.8;

/** Compares two `0.x.y` strings; negative when `a` is older. */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [a, b].map((version) => version.split(".").map(Number));
  for (let index = 0; index < 3; index++) {
    const difference = (left?.[index] ?? 0) - (right?.[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** A version in prose, with the package it sits next to. */
export interface VersionMention {
  line: number;
  name: string;
  version: string;
}

/** Each `0.x.y` within NEAR characters of an `@maple-kit/<name>` on its line. */
export function versionMentions(text: string): VersionMention[] {
  const found: VersionMention[] = [];
  forEachProseLine(text, (content, line) => {
    const names = [...content.matchAll(/@maple-kit\/([a-z-]+)/g)].map((match) => ({
      end: match.index + match[0].length,
      name: `@maple-kit/${match[1] ?? ""}`,
      start: match.index,
    }));
    if (names.length === 0 || content.includes(IGNORE)) return;
    for (const match of content.matchAll(/(?<![\d.])0\.\d+\.\d+(?!\.?\d)/g)) {
      const at = match.index;
      const distance = (name: { end: number; start: number }) =>
        at >= name.end ? at - name.end : name.start - (at + match[0].length);
      const nearest = names.toSorted((a, b) => distance(a) - distance(b))[0];
      if (nearest !== undefined && distance(nearest) <= NEAR) {
        found.push({ line, name: nearest.name, version: match[0] });
      }
    }
  });
  return found;
}

/** Calls `visit` with each line outside fenced code, numbered from 1. */
function forEachProseLine(text: string, visit: (content: string, line: number) => void): void {
  let fence: string | undefined;
  text.split("\n").forEach((content, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(content)?.[1];
    if (marker !== undefined && (fence === undefined || marker.startsWith(fence))) {
      fence = fence === undefined ? marker : undefined;
      return;
    }
    if (fence === undefined) visit(content, index + 1);
  });
}

/** A version mention older than its package's current version, as lines. */
export function staleVersions(
  file: string,
  text: string,
  current: ReadonlyMap<string, string>,
): string[] {
  return versionMentions(text).flatMap(({ line, name, version }) => {
    const latest = current.get(name);
    if (latest === undefined || compareVersions(version, latest) >= 0) return [];
    return [`${file}:${line}: ${version} is older than ${name}'s current ${latest}.`];
  });
}

/** A paragraph, normalised for comparison, with the line it starts on. */
export interface Paragraph {
  line: number;
  words: string[];
}

/** Every paragraph outside fenced code, lower-cased with Markdown stripped. */
export function paragraphs(text: string): Paragraph[] {
  const found: Paragraph[] = [];
  let current: Paragraph | undefined;
  let ignored = false;
  const flush = () => {
    if (current !== undefined && current.words.length > 0 && !ignored) found.push(current);
    current = undefined;
  };
  forEachProseLine(text, (content, line) => {
    if (content.trim() === "" || /^\s*(?:#|\||<!--)/.test(content)) {
      flush();
      ignored = content.trim() === IGNORE;
      return;
    }
    const words = content.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];
    current ??= { line, words: [] };
    current.words.push(...words);
  });
  flush();
  return found;
}

/** The fraction of the smaller paragraph's word trigrams the other shares. */
export function overlap(a: readonly string[], b: readonly string[]): number {
  const grams = (words: readonly string[]) =>
    new Set(words.slice(2).map((word, index) => `${words[index]} ${words[index + 1]} ${word}`));
  const [left, right] = [grams(a), grams(b)];
  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;
  if (smaller.size === 0) return 0;
  let shared = 0;
  for (const gram of smaller) if (larger.has(gram)) shared++;
  return shared / smaller.size;
}

/** Each later paragraph that repeats an earlier one in the same file. */
export function duplicateParagraphs(file: string, text: string): string[] {
  const long = paragraphs(text).filter((paragraph) => paragraph.words.length >= MIN_WORDS);
  const problems: string[] = [];
  long.forEach((paragraph, index) => {
    const earlier = long
      .slice(0, index)
      .find((other) => overlap(other.words, paragraph.words) >= OVERLAP);
    if (earlier !== undefined) {
      problems.push(`${file}:${paragraph.line}: repeats the paragraph at line ${earlier.line}.`);
    }
  });
  return problems;
}

function git(root: string, ...args: string[]): string {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- git is whichever one the hook or CI runs.
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

/**
 * Each package's newest release, from its `@maple-kit/<name>@x.y.z` tags. Not
 * package.json: on the version pull request that is a version nobody can
 * install yet. A package with no tag here, as in a shallow clone, is skipped.
 */
export function releasedVersions(root: string): Map<string, string> {
  const released = new Map<string, string>();
  for (const tag of git(root, "tag", "--list", "@maple-kit/*").split("\n")) {
    const at = tag.lastIndexOf("@");
    const [name, version] = [tag.slice(0, at), tag.slice(at + 1)];
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const newest = released.get(name);
    if (newest === undefined || compareVersions(version, newest) > 0) released.set(name, version);
  }
  return released;
}

/** Markdown this check reads: all of it except changelogs and vendored skills. */
export function isChecked(file: string): boolean {
  return file.endsWith(".md") && !file.endsWith("CHANGELOG.md") && !file.startsWith(".agents/");
}

/** Runs both guards on every Markdown file git knows under `root`. */
export function checkRepository(root: string): string[] {
  const current = releasedVersions(root);
  return git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    .split("\0")
    .filter((file) => isChecked(file) && existsSync(join(root, file)))
    .flatMap((file) => {
      const text = readFileSync(join(root, file), "utf8");
      return [...staleVersions(file, text, current), ...duplicateParagraphs(file, text)];
    });
}

function main(): void {
  const problems = checkRepository(fileURLToPath(new URL("../..", import.meta.url)));
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  if (problems.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
