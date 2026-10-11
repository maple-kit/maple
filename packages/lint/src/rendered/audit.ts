/**
 * Driving a real browser over a deployed preview.
 *
 * Two passes run at every viewport: one as a reviewer sees the page, and one
 * with reduced motion emulated, which is the only way to tell a page that
 * honours the query from one that hard-codes its motion.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createLogger } from "@maple-kit/core/logger";
import { toCommentContext } from "@maple-kit/core/overlay";

import { readTokenFiles, type TokenSet } from "../tokens.js";
import { reducedMotionFindings, renderedFindings, unreadableColors } from "./rules.js";

import type { Reading } from "./collect.js";
import type { CommentContext } from "@maple-kit/core";
import type { Finding } from "@maple-kit/core/connectors";
import type { Logger } from "@maple-kit/core/logger";
import type { Browser, BrowserContext, Page } from "playwright";

/** One size the page is judged at. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The viewports used when a host configures none: a phone, a tablet, a laptop. */
export const DEFAULT_VIEWPORTS: readonly Viewport[] = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

/** What a rendered run needs to know. */
export interface RenderedLintOptions {
  /** The preview's URL. */
  readonly url: string;
  /** CSS files the token set is read from, the same ones the static tier uses. */
  readonly tokenFiles: readonly string[];
  /**
   * The sizes to judge at. Any list, any number: a wall display and no phone
   * is as valid as the default. Omitted, `DEFAULT_VIEWPORTS` is used.
   */
  readonly viewports?: readonly Viewport[];
  /**
   * The preview platform's bypass, sent as request headers. Reviewer cookies
   * are never used: a lint run is CI's and does not borrow a person's session.
   */
  readonly bypassHeaders?: Readonly<Record<string, string>>;
  /** How long one page is given to load, in ms. Default 30000. */
  readonly timeout?: number;
  /**
   * How long to wait after load before reading, in ms. Default 0. An app that
   * paints after hydration needs a little; nothing else does.
   */
  readonly settleMs?: number;
  /** An already-launched browser, which a test supplies and a run does not. */
  readonly browser?: Browser;
  /**
   * Where a run says what it could not check. Defaults to warning through
   * Maple's own logger; a host that captures its own passes one in.
   */
  readonly logger?: Logger;
}

/** A finished run: what was found, and the page it was found on. */
export interface RenderedRun {
  readonly findings: readonly Finding[];
  /**
   * The environment each finding was seen in, aligned with `findings`. A
   * finding seen only at 375px carries 375px, not the run's widest viewport.
   */
  readonly contexts: readonly CommentContext[];
  /** The widest viewport read, for a caller that wants one context. */
  readonly context: CommentContext;
}

/**
 * Says what the run could not read: a colour nobody can parse is not a clean
 * page but an unchecked one, and a green result should not hide that.
 */
function warnGaps(log: Logger, tokens: TokenSet, seen: readonly string[]): void {
  for (const [name, value] of tokens.unreadable) {
    log.warn("Token could not be read, so nothing is checked against it", { token: name, value });
  }
  if (seen.length > 0) {
    log.warn("Colours on the page could not be read, so they were not judged", { values: seen });
  }
  if (tokens.colors.size === 0) {
    log.warn("No colour token was found, so the colour rule checked nothing", {});
  }
  if (tokens.fontSizes.size === 0) {
    log.warn("No type token was found, so the type-scale rule checked nothing", {
      hint: "a type token is named --…-text-…, --…-font-… or --…-type-…",
    });
  }
}

/** A finding and the environment it was first seen in. */
export interface Seen {
  readonly finding: Finding;
  readonly context: CommentContext;
}

/** Findings from one viewport, kept apart so a dedupe can say where they were. */
export interface Pass {
  readonly viewport: Viewport;
  readonly findings: readonly Finding[];
  readonly context: CommentContext;
  /** Colours this viewport painted that no rule could read. */
  readonly unreadable: readonly string[];
}

function label(viewport: Viewport): string {
  return `${viewport.width}×${viewport.height}`;
}

/** Where the built page bundle is, next to this module once the package is built. */
function pageBundle(): string {
  const path = fileURLToPath(new URL("../page/page.iife.js", import.meta.url));
  if (existsSync(path)) return path;
  throw new Error(
    `@maple-kit/lint: the page bundle is missing at ${path}. Run \`pnpm --filter @maple-kit/lint build\` before linting from source.`,
  );
}

/** Loads the reader into the page and calls it. */
async function read(page: Page): Promise<Reading> {
  await page.addScriptTag({ path: pageBundle() });
  const reading = await page.evaluate(() => {
    const run = window.__mapleLintRead;
    if (!run) throw new Error("@maple-kit/lint: the page bundle did not install its reader.");
    return run();
  });
  return reading;
}

/** Where a page is opened from, and how long it is given. */
interface Visit {
  readonly url: string;
  readonly timeout: number;
  readonly settleMs: number;
}

/** Opens a page, reads it, and closes the context it opened. */
async function collect(context: BrowserContext, visit: Visit): Promise<Reading> {
  const { url, timeout, settleMs } = visit;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout });
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    return await read(page);
  } finally {
    await context.close();
  }
}

/** Both passes at one viewport. */
async function auditViewport(
  browser: Browser,
  options: RenderedLintOptions,
  viewport: Viewport,
  tokens: TokenSet,
): Promise<Pass> {
  const shared = {
    viewport,
    // The reader is injected, and a preview with a strict script-src would
    // otherwise refuse it and fail the run rather than lint it.
    bypassCSP: true,
    ...(options.bypassHeaders === undefined ? {} : { extraHTTPHeaders: options.bypassHeaders }),
  };
  const visit: Visit = {
    url: options.url,
    timeout: options.timeout ?? 30_000,
    settleMs: options.settleMs ?? 0,
  };
  const seen = await collect(await browser.newContext(shared), visit);
  const reduced = await collect(
    await browser.newContext({ ...shared, reducedMotion: "reduce" }),
    visit,
  );
  return {
    viewport,
    context: toCommentContext(seen.context),
    unreadable: unreadableColors(seen.records),
    findings: [
      ...renderedFindings(seen.records, tokens),
      ...reducedMotionFindings(reduced.records),
    ],
  };
}

/**
 * What makes a finding the same finding: every rung, not the selector alone.
 * `cssPathTo` gives none when no path identifies the element uniquely.
 */
function keyOf(found: Finding): string {
  const { key, source, component, selector } = found.anchor;
  const place = [key, source, component, selector].map((rung) => rung ?? "").join("\u0000");
  return `${found.rule}\u0000${place}\u0000${found.message}`;
}

/**
 * One finding per place per rule. A finding at every viewport reads as it was
 * written; one at only some names them, because "only on the phone" is most of
 * what the reader needs to know.
 */
export function dedupe(passes: readonly Pass[]): readonly Seen[] {
  const groups = new Map<string, { found: Finding; at: string[]; context: CommentContext }>();
  for (const pass of passes) {
    for (const found of pass.findings) {
      const group = groups.get(keyOf(found)) ?? { found, at: [], context: pass.context };
      group.at.push(label(pass.viewport));
      groups.set(keyOf(found), group);
    }
  }
  return [...groups.values()].map(({ found, at, context }) => ({
    finding:
      at.length === passes.length
        ? found
        : { ...found, message: `${found.message} At ${at.join(", ")}.` },
    context,
  }));
}

/**
 * Playwright is loaded here rather than at the top of the module, so importing
 * this package for `findingComment` alone needs no peer dependency.
 */
async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch();
}

/** The widest viewport's context: the one a stored comment should carry. */
function widest(passes: readonly Pass[]): CommentContext {
  const found = [...passes].sort((a, b) => b.viewport.width - a.viewport.width)[0];
  if (!found) throw new Error("@maple-kit/lint: a run needs at least one viewport.");
  return found.context;
}

/**
 * Lints a live preview. Launches Chromium unless a browser is supplied, and
 * closes only what it opened.
 */
export async function lintRendered(options: RenderedLintOptions): Promise<RenderedRun> {
  const tokens = await readTokenFiles(options.tokenFiles);
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const browser = options.browser ?? (await launch());
  try {
    const passes: Pass[] = [];
    for (const viewport of viewports) {
      passes.push(await auditViewport(browser, options, viewport, tokens));
    }
    const log = options.logger ?? createLogger({ level: "warn" });
    warnGaps(log, tokens, [...new Set(passes.flatMap((pass) => pass.unreadable))]);
    const seen = dedupe(passes);
    return {
      findings: seen.map((one) => one.finding),
      contexts: seen.map((one) => one.context),
      context: widest(passes),
    };
  } finally {
    if (options.browser === undefined) await browser.close();
  }
}
