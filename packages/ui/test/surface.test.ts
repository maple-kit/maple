import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "..", "src");

interface SourceFile {
  readonly path: string;
  readonly text: string;
  /** The same file with its comments removed, so prose about a banned call is prose. */
  readonly code: string;
}

function sources(directory: string): SourceFile[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    if (!entry.endsWith(".ts")) return [];
    const text = readFileSync(path, "utf8");
    return [{ path, text, code: text.replace(/\/\*[^]*?\*\//g, "").replace(/\/\/[^\n]*/g, "") }];
  });
}

const FILES = sources(SRC);

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(HERE, "..", path), "utf8")) as Record<string, unknown>;
}

const MANIFEST = json("package.json");

/**
 * The split is the point: an application rendering comments in its own design
 * system depends on @maple-kit/react and pulls in none of these parts.
 */
describe("the package split", () => {
  it("never re-exports @maple-kit/react", () => {
    const offenders = FILES.filter(({ text }) =>
      /export[^;]*from\s*"@maple-kit\/react"/.test(text),
    );
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  it("is not depended on by @maple-kit/react", () => {
    const react = JSON.parse(
      readFileSync(join(HERE, "..", "..", "react", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

    expect(Object.keys(react.dependencies ?? {})).not.toContain("@maple-kit/ui");
    expect(Object.keys(react.peerDependencies ?? {})).not.toContain("@maple-kit/ui");
  });

  it("keeps React a peer and the package side-effect free", () => {
    expect(MANIFEST["sideEffects"]).toBe(false);
    expect(MANIFEST["type"]).toBe("module");
    expect(Object.keys(MANIFEST["peerDependencies"] as object)).toEqual(["react", "react-dom"]);
  });
});

/** Granular subpaths, set up now so a later part only fills one in. */
describe("the exports map", () => {
  const exports = MANIFEST["exports"] as Record<string, string>;

  it("names every part as its own subpath", () => {
    expect(Object.keys(exports).sort((a, b) => a.localeCompare(b))).toEqual([
      ".",
      "./composer",
      "./icons",
      "./island",
      "./maple",
      "./marks",
      "./package.json",
      "./picker",
    ]);
  });

  /**
   * The composition is the one entry that names every part, which is the
   * deal an application makes by importing it rather than the parts.
   */
  it("keeps the default composition off the root entry", () => {
    const root = readFileSync(join(SRC, "index.ts"), "utf8");

    expect(exports["./maple"]).toBe("./dist/maple.js");
    expect(root).not.toContain("./maple.js");
  });

  const entries = Object.entries(exports).filter(([, target]) => target.endsWith(".js"));

  it.each(entries)("resolves %s to a module that exists", (subpath, target) => {
    const source = target.replace("./dist/", "").replace(/\.js$/, ".ts");
    expect(FILES.some(({ path }) => path.endsWith(join("src", source)))).toBe(true);
    expect(subpath.startsWith(".")).toBe(true);
  });

  it("has no index naming every part, which is how tree-shaking stops working", () => {
    const root = readFileSync(join(SRC, "index.ts"), "utf8");
    for (const part of ["./island/", "./marks/", "./composer/"]) {
      expect(root).not.toContain(part);
    }
  });
});

/**
 * docs/overlay-csp.md's claim is checkable by reading one function, and stays
 * that way only if nothing else in the package reaches for the banned calls.
 */
describe("the CSP claim", () => {
  it.each([
    ["a constructed stylesheet", /new CSSStyleSheet/],
    ["cssText", /cssText/],
    ["storage", /localStorage|sessionStorage/],
    ["a worker", /new Worker|Worker\(/],
    ["the document", /\bdocument\./],
    ["a raw console call", /\bconsole\./],
  ])("reaches for %s nowhere in the package", (_what, pattern) => {
    const offenders = FILES.filter(({ code }) => pattern.test(code));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });
});

describe("the icons", () => {
  const icons = FILES.filter(
    ({ path }) => path.includes(join("src", "icons")) && !/(index|icon|crossfade)\.ts$/.test(path),
  );

  it("ships nine of them", () => {
    expect(icons).toHaveLength(9);
  });

  it("gives each one its own module, so importing one drags in one", () => {
    for (const icon of icons) {
      expect(icon.text.match(/export const/g)).toHaveLength(1);
    }
  });

  it("collects them into no record", () => {
    const index = readFileSync(join(SRC, "icons", "index.ts"), "utf8");
    expect(index).not.toMatch(/const ICONS/);
    expect(index).not.toMatch(/=\s*\{/);
  });
});
