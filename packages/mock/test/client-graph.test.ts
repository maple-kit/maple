import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FROM = /from "([^"]+)"$/;

/** The runtime specifiers of a module's import and export-from statements. */
function specifiers(source: string): string[] {
  const code = source
    .split("*/")
    .map((part) => part.split("/*")[0])
    .join("");
  return code
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => /^(import|export) /.test(statement))
    .filter((statement) => !/^(import|export) type /.test(statement))
    .flatMap((statement) => FROM.exec(statement)?.[1] ?? []);
}

/** Every module `entry` reaches at runtime, and every package it imports. */
function reach(entry: string): { modules: Set<string>; packages: Set<string> } {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (modules.has(id)) continue;
    modules.add(id);
    for (const specifier of specifiers(readFileSync(join(SRC, id), "utf8"))) {
      if (!specifier.startsWith(".")) packages.add(specifier);
      else queue.push(normalize(join(dirname(id), specifier.replace(/\.js$/, ".ts"))));
    }
  }
  return { modules, packages };
}

/** The box renders on pages that do not mock; they must not load the transport. */
describe("the box's controller", () => {
  const { modules, packages } = reach("client/index.ts");

  it("never imports the interceptor", () => {
    expect([...modules]).not.toContain("interceptor.ts");
    expect([...packages].filter((name) => name.startsWith("@mswjs/"))).toEqual([]);
  });

  it("imports only core", () => {
    expect([...packages].sort((a, b) => a.localeCompare(b))).toEqual([
      "@maple-kit/core/client",
      "@maple-kit/core/mock",
    ]);
  });
});
