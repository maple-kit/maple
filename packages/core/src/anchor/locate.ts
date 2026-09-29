/**
 * Finding the file and line behind an element on a page nothing tagged.
 *
 * The tagger is a build step, and `maple review` runs with none. A dev server
 * does serve a source map per module, and React's owner stack says which
 * module and position wrote each element. A pick becomes a target in one
 * synchronous step, so maps are fetched ahead: `warm` reads the loaded scripts,
 * and a frame that misses starts its own fetch. `docs/review.md` names the
 * frameworks this has been proven on.
 */

import { readSourceMap } from "../lib/source-map.js";
import { ownerFrames } from "./owner-stack.js";

import type { RawSourceMap, SourceMapReader } from "../lib/source-map.js";
import type { StackFrame } from "./owner-stack.js";

/** Where an element was written, in the form the tagger records. */
export interface SourceLocation {
  /** `path/to/file.tsx:line:column`, relative to the root where it can be. */
  readonly source: string;
  /** The component that rendered the element, when React says. */
  readonly component?: string;
}

/** What a locator is given. */
export interface SourceLocatorOptions {
  /** The repository's directory on the developer's machine, which paths are made relative to. */
  readonly root?: string;
  /** How maps are fetched. Defaults to the page's own `fetch`. */
  readonly fetch?: typeof fetch;
}

/** Answers where an element was written, from what has been loaded so far. */
export interface SourceLocator {
  /** Where `element` was written, or undefined when nothing loaded says. */
  locate(element: Element): SourceLocation | undefined;
  /** Fetches the source map of every script the page has loaded. Never rejects. */
  warm(): Promise<void>;
}

/** A module's map, and the absolute path its generator recorded, which sources are relative to. */
interface Loaded {
  readonly reader: SourceMapReader;
  readonly file?: string;
}

const MAP_COMMENT = "//# sourceMappingURL=";

/** Served scripts worth reading a map for: the app's own, not the framework's or a dependency's. */
const APPLICATION_SCRIPT = /\.(?:[cm]?[jt]sx?|vue|svelte)(?:\?|$)/;
const LIBRARY_SCRIPT = /node_modules|\/@vite\/|\/@react-refresh|\/@id\/|\/__maple\//;

/** More than this many is a page bundling far past what a dev server serves. */
const MAXIMUM_MODULES = 300;

function decodeDataUrl(url: string): string | undefined {
  const comma = url.indexOf(",");
  if (!url.startsWith("data:") || comma === -1) return undefined;
  const payload = url.slice(comma + 1);
  if (!url.slice(0, comma).endsWith(";base64")) return decodeURIComponent(payload);
  const bytes = Uint8Array.from(atob(payload), (char) => char.codePointAt(0) ?? 0);
  return new TextDecoder().decode(bytes);
}

/** A module's own source map, inline or one request away, or undefined where it names none. */
async function fetchMap(url: string, fetcher: typeof fetch): Promise<RawSourceMap | undefined> {
  const module = await fetcher(url);
  if (!module.ok) return undefined;
  const text = await module.text();
  const at = text.lastIndexOf(MAP_COMMENT);
  if (at === -1) return undefined;

  const reference = text.slice(at + MAP_COMMENT.length).split(/\s/)[0] ?? "";
  const inline = decodeDataUrl(reference);
  if (inline !== undefined) return JSON.parse(inline) as RawSourceMap;

  const map = await fetcher(new URL(reference, url));
  return map.ok ? ((await map.json()) as RawSourceMap) : undefined;
}

/** A scheme a bundler invents for its sources, as the path inside the project. */
function bundlerPath(path: string): string {
  return path
    .replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*\//i, "")
    .replace(/^\[project\]\//, "")
    .replace(/^\([^)]*\)\//, "")
    .replace(/^\.\//, "");
}

/**
 * A source as a path relative to `root`. Vite's map names a file beside the
 * module and records the absolute path it came from, so that is the base.
 */
function repositoryPath(source: string, moduleUrl: string, loaded: Loaded, root?: string): string {
  const base = loaded.file?.startsWith("/") ? `file://${loaded.file}` : moduleUrl;
  const { protocol, pathname } = new URL(source, base);
  let path = bundlerPath(source);
  if (source.startsWith("/")) path = source;
  else if (protocol === "file:") path = decodeURIComponent(pathname);
  else if (protocol.startsWith("http")) path = pathname.slice(1);

  if (root === undefined) return path;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** Whether a location is the application's rather than a library's. */
function isApplication(path: string): boolean {
  return !path.includes("node_modules");
}

/** The scripts a page has loaded, from its own document and its resource timings. */
function loadedScripts(): string[] {
  const urls = new Set<string>();
  for (const script of document.querySelectorAll("script[src]")) {
    urls.add((script as HTMLScriptElement).src);
  }
  for (const entry of performance.getEntriesByType("resource")) urls.add(entry.name);
  return [...urls].filter(
    (url) =>
      url.startsWith(location.origin) && APPLICATION_SCRIPT.test(url) && !LIBRARY_SCRIPT.test(url),
  );
}

/** Creates a locator with its own cache of source maps. */
export function createSourceLocator(options: SourceLocatorOptions = {}): SourceLocator {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  // A module is `null` once it is known to have no usable map, so it is asked for once.
  const maps = new Map<string, Loaded | null>();
  const asked = new Map<string, Promise<void>>();

  function load(url: string): Promise<void> {
    const started = asked.get(url) ?? read(url);
    asked.set(url, started);
    return started;
  }

  async function read(url: string): Promise<void> {
    try {
      const raw = await fetchMap(url, fetcher);
      const reader = raw === undefined ? undefined : readSourceMap(raw);
      const file = (raw as { file?: unknown } | undefined)?.file;
      maps.set(
        url,
        reader === undefined ? null : { reader, ...(typeof file === "string" ? { file } : {}) },
      );
    } catch {
      maps.set(url, null);
    }
  }

  function place(frame: StackFrame): string | undefined {
    const loaded = maps.get(frame.url);
    if (loaded === undefined) {
      void load(frame.url);
      return undefined;
    }
    const original = loaded?.reader(frame.line, frame.column - 1);
    if (original === undefined || loaded === null) return undefined;
    const path = repositoryPath(original.source, frame.url, loaded, options.root);
    return isApplication(path) ? `${path}:${original.line}:${original.column + 1}` : undefined;
  }

  return {
    locate(element) {
      for (const frame of ownerFrames(element)) {
        const source = place(frame);
        if (source !== undefined) {
          return {
            source,
            ...(frame.component === undefined ? {} : { component: frame.component }),
          };
        }
      }
      return undefined;
    },
    async warm() {
      await Promise.all(loadedScripts().slice(0, MAXIMUM_MODULES).map(load));
    },
  };
}

let installed: SourceLocator | undefined;

/**
 * Turns locating on for this page and starts reading what it has loaded.
 * Nothing calls this on a page that has not asked, so `locateSource` answers
 * nothing there and costs nothing.
 */
export function installSourceLocator(options: SourceLocatorOptions = {}): SourceLocator {
  installed = createSourceLocator(options);
  void installed.warm();
  return installed;
}

/** Where `element` was written, from the installed locator, or undefined without one. */
export function locateSource(element: Element): SourceLocation | undefined {
  return installed?.locate(element);
}
