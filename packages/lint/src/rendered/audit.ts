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
import { lintJudged } from "./judged.js";
import { reducedMotionFindings, renderedFindings, unreadableColors } from "./rules.js";

import type { JudgedRead, JudgedStats, Reading, TargetLimits } from "./collect.js";
import type { CommentContext } from "@maple-kit/core";
import type { Finding, RuleConnector } from "@maple-kit/core/connectors";
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

/** The judged tier, switched on by passing a connector. */
export interface JudgedOptions extends TargetLimits {
  /**
   * What judges the page. Each viewport's elements go to `evaluate` in one
   * call. Findings are `judged`, `advice` unless the rule says otherwise.
   */
  readonly connector: RuleConnector;
  /**
   * Repo-relative changed files. When set, elements from those files go
   * first, untagged ones follow if there is room, other files are skipped.
   */
  readonly sources?: readonly string[];
}

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
   * Also put the page's rules to a judge, on the pages this run opens.
   * A judge that fails is reported in `judgedErrors` and never fails the run.
   */
  readonly judged?: JudgedOptions;
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
  /**
   * One line per viewport whose judge rejected. A viewport listed here was
   * not judged: no judged findings there is not a pass.
   */
  readonly judgedErrors: readonly string[];
  /**
   * What the judge was and was not shown; absent without a judge. Counts are
   * the largest any viewport saw, the lists the union.
   */
  readonly judgedStats?: JudgedStats;
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

/** One stats object for the run: the largest counts, the union of the lists. */
export function mergeStats(passes: readonly Pass[]): JudgedStats | undefined {
  const all = passes.flatMap((pass) => pass.judgedStats ?? []);
  if (all.length === 0) return undefined;
  const most = (pick: (stats: JudgedStats) => number) => Math.max(...all.map(pick));
  const union = (pick: (stats: JudgedStats) => readonly string[]) => [
    ...new Set(all.flatMap(pick)),
  ];
  return {
    matched: most((s) => s.matched),
    groups: most((s) => s.groups),
    sent: most((s) => s.sent),
    droppedByCap: most((s) => s.droppedByCap),
    notChanged: most((s) => s.notChanged),
    rulesAtCap: union((s) => s.rulesAtCap),
    broadRules: union((s) => s.broadRules),
    invalidSelectors: union((s) => s.invalidSelectors),
  };
}

/** Says what the judge could not do, one warning each, so none is mistaken for a pass. */
function warnJudged(log: Logger, passes: readonly Pass[]): readonly string[] {
  const errors: string[] = [];
  for (const pass of passes) {
    const at = label(pass.viewport);
    if (pass.judgedError !== undefined) {
      errors.push(`${at}: ${pass.judgedError}`);
      log.warn("The judge failed, so this viewport was not judged", {
        viewport: at,
        error: pass.judgedError,
      });
    }
  }
  const stats = mergeStats(passes);
  if (stats === undefined) return errors;
  if (stats.invalidSelectors.length > 0) {
    log.warn("A rule's selector is not valid, so the rule judged nothing", {
      rules: stats.invalidSelectors,
    });
  }
  if (stats.droppedByCap > 0) {
    log.warn("Some matching elements were over the caps and were not judged", {
      dropped: stats.droppedByCap,
      rules: stats.rulesAtCap,
    });
  }
  if (stats.broadRules.length > 0) {
    log.warn("These rules match far more than the caps allow; narrow their appliesTo", {
      rules: stats.broadRules,
    });
  }
  return errors;
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
  /** Why this viewport's judge call failed, if it did. */
  readonly judgedError?: string;
  /** What this viewport's judge was and was not shown. */
  readonly judgedStats?: JudgedStats;
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
async function read(page: Page, judged: JudgedRead): Promise<Reading> {
  await page.addScriptTag({ path: pageBundle() });
  const reading = await page.evaluate((arg) => {
    const run = window.__mapleLintRead;
    if (!run) throw new Error("@maple-kit/lint: the page bundle did not install its reader.");
    return run(arg);
  }, judged);
  return reading;
}

/** Where a page is opened from, and how long it is given. */
interface Visit {
  readonly url: string;
  readonly timeout: number;
  readonly settleMs: number;
  /** What to read for the judge; the reduced-motion pass reads none. */
  readonly judged: JudgedRead;
}

/** Opens a page, reads it, and closes the context it opened. */
async function collect(context: BrowserContext, visit: Visit): Promise<Reading> {
  const { url, timeout, settleMs } = visit;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout });
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    return await read(page, visit.judged);
  } finally {
    await context.close();
  }
}

/** What a pass reads for the judge: the connector stays in Node. */
function readFor(judged: JudgedOptions): JudgedRead {
  const { connector, sources, ...limits } = judged;
  return { ...limits, rules: connector.rules, ...(sources === undefined ? {} : { sources }) };
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
  const { judged } = options;
  const visit: Visit = {
    url: options.url,
    timeout: options.timeout ?? 30_000,
    settleMs: options.settleMs ?? 0,
    judged: { rules: [] },
  };
  const seen = await collect(await browser.newContext(shared), {
    ...visit,
    judged: judged === undefined ? visit.judged : readFor(judged),
  });
  const reduced = await collect(
    await browser.newContext({ ...shared, reducedMotion: "reduce" }),
    visit,
  );
  const verdict =
    judged === undefined
      ? undefined
      : await lintJudged(judged.connector, { url: options.url, viewport, judged: seen.judged });
  return {
    viewport,
    context: toCommentContext(seen.context),
    unreadable: unreadableColors(seen.records),
    findings: [
      ...renderedFindings(seen.records, tokens),
      ...reducedMotionFindings(reduced.records),
      ...(verdict?.findings ?? []),
    ],
    ...(verdict?.error === undefined ? {} : { judgedError: verdict.error }),
    ...(judged === undefined ? {} : { judgedStats: seen.judged.stats }),
  };
}

/**
 * What makes a finding the same finding: every rung, not the selector alone.
 * A judged message is left out, as its wording changes run to run.
 */
function keyOf(found: Finding): string {
  const { key, source, component, selector } = found.anchor;
  const place = [key, source, component, selector].map((rung) => rung ?? "").join("\u0000");
  const said = found.tier === "judged" ? "" : found.message;
  return `${found.rule}\u0000${place}\u0000${said}`;
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
    const judgedErrors = warnJudged(log, passes);
    const judgedStats = mergeStats(passes);
    const seen = dedupe(passes);
    return {
      judgedErrors,
      ...(judgedStats === undefined ? {} : { judgedStats }),
      findings: seen.map((one) => one.finding),
      contexts: seen.map((one) => one.context),
      context: widest(passes),
    };
  } finally {
    if (options.browser === undefined) await browser.close();
  }
}
