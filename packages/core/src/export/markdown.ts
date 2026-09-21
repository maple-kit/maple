/**
 * Comments as a pull-request body: a wordmark, a table a person reads, and a
 * fenced JSON block an agent reads, each under the line that says what it is.
 *
 * Two constraints shape everything here. The fence is **visible**, never an
 * HTML comment, because the action that hands a pull-request body to an agent
 * strips `<!-- -->` before the model sees it. And it has a byte budget, so
 * detail is shed in a fixed order rather than comments being dropped.
 * `docs/branding.md` covers the chrome around them.
 */

import { stableStringify } from "../lib/stable-stringify.js";

import type { Comment, CommentAnchor, CommentContext, RegionContext, TextQuote } from "../types.js";

/** The fence's schema version. A reader seeing a higher one must stop, not guess. */
export const FENCE_VERSION = 1;

/** Bytes the fence is kept under, well inside GitHub's 65,536-character body. */
export const FENCE_BUDGET = 8192;

/** Detail the exporter will shed, in the order it sheds it. */
export type Reduction = "quote-context" | "regions" | "selector" | "context" | "quote";

/**
 * Regions shed before the selector, being the least load-bearing thing in the
 * fence. Content width never sheds: `essentialContext` keeps it.
 */
const REDUCTIONS: readonly Reduction[] = [
  "quote-context",
  "regions",
  "selector",
  "context",
  "quote",
];

/** How the export is built. */
export interface ExportOptions {
  /** Branch or pull request the comments belong to. */
  readonly branch: string;
  /** Hosted screenshot URL per comment id. `data:` URLs are dropped. */
  readonly screenshots?: ReadonlyMap<string, string>;
  /** Defaults to {@link FENCE_BUDGET}. */
  readonly budget?: number;
  /**
   * False leaves the fence out. A summary repeating a fence already on the pull
   * request reads back as a second comment; `docs/connectors.md` says why.
   */
  readonly fence?: boolean;
}

/** The markdown, and what it cost to fit. */
export interface MarkdownExport {
  readonly markdown: string;
  /** Size of the fence alone, in bytes. */
  readonly bytes: number;
  /** Detail shed to come in under budget, in the order it was shed. */
  readonly reduced: readonly Reduction[];
  /** True when even the smallest form is over budget. Say so; do not truncate. */
  readonly overBudget: boolean;
}

/** Where the chrome points. The repository is public; both assets are in it. */
const REPO_URL = "https://github.com/maple-kit/maple";
const ASSET_URL = "https://raw.githubusercontent.com/maple-kit/maple/main/docs/assets";

/**
 * Two files in a `<picture>`, on one line: GitHub strips inline SVG, and a
 * blank line inside an HTML block ends it. `docs/branding.md` says why two.
 */
const BANNER = [
  "<picture>",
  `<source media="(prefers-color-scheme: dark)" srcset="${ASSET_URL}/wordmark-dark.svg">`,
  `<img src="${ASSET_URL}/wordmark.svg" alt="Maple" height="22">`,
  "</picture>",
].join("");

const FENCE_LEAD = "The full comment details in markdown, to copy into an agent:";

const FOOTER = `---\n\n<sub>powered by <a href="${REPO_URL}">Maple</a></sub>`;

/** Builds the pull-request body for a set of comments. */
export function exportMarkdown(
  comments: readonly Comment[],
  options: ExportOptions,
): MarkdownExport {
  const head = [
    BANNER,
    "",
    ...introduce(comments),
    table(comments, hostedOnly(options.screenshots)),
  ];
  if (options.fence === false) {
    return { markdown: [...head, "", FOOTER].join("\n"), bytes: 0, reduced: [], overBudget: false };
  }

  const budget = options.budget ?? FENCE_BUDGET;
  const { fence, bytes, reduced } = fit(comments, options.branch, budget);
  const body = [...head, "", FENCE_LEAD, "", "```maple", fence, "```", "", FOOTER];
  return { markdown: body.join("\n"), bytes, reduced, overBudget: bytes > budget };
}

/** What a reader gets back out of a fence, including fields Maple does not know. */
export interface ParsedFence {
  readonly version: number;
  readonly branch: string;
  readonly comments: readonly Comment[];
  /** The object exactly as parsed, so a rewrite preserves unknown fields. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** Raised when a fence declares a version this code cannot read. */
export class UnsupportedFenceError extends Error {
  override readonly name = "UnsupportedFenceError";

  constructor(readonly version: number) {
    super(`This fence is version ${version}; this build reads version ${FENCE_VERSION}.`);
  }
}

const FENCE = /```maple[^\n]*\n([\s\S]*?)\n```/;

/**
 * Reads the fence out of a markdown body, or returns undefined when there is
 * none. A fence from a future version throws rather than being half-read.
 */
export function parseFence(markdown: string): ParsedFence | undefined {
  const body = FENCE.exec(markdown)?.[1];
  if (body === undefined) return undefined;

  const raw: unknown = JSON.parse(body);
  if (typeof raw !== "object" || raw === null) return undefined;

  const document = raw as Record<string, unknown>;
  const version = typeof document["version"] === "number" ? document["version"] : 0;
  if (version > FENCE_VERSION) throw new UnsupportedFenceError(version);

  return {
    version,
    branch: typeof document["branch"] === "string" ? document["branch"] : "",
    comments: Array.isArray(document["comments"]) ? (document["comments"] as Comment[]) : [],
    raw: document,
  };
}

interface Fitted {
  readonly fence: string;
  readonly bytes: number;
  readonly reduced: readonly Reduction[];
}

/** Sheds detail until the fence fits, or reports that it never did. */
function fit(comments: readonly Comment[], branch: string, budget: number): Fitted {
  const applied: Reduction[] = [];
  let fence = encode(comments, branch, applied);

  for (const reduction of REDUCTIONS) {
    if (size(fence) <= budget) break;
    applied.push(reduction);
    fence = encode(comments, branch, applied);
  }

  return { fence, bytes: size(fence), reduced: applied };
}

function encode(
  comments: readonly Comment[],
  branch: string,
  reduced: readonly Reduction[],
): string {
  return stableStringify({
    version: FENCE_VERSION,
    branch,
    comments: comments.map((comment) => reduce(comment, reduced)),
  });
}

function reduce(comment: Comment, reduced: readonly Reduction[]): Comment {
  return {
    ...comment,
    anchor: reduceAnchor(comment.anchor, reduced),
    context: reduceContext(comment.context, reduced),
  };
}

function reduceContext(context: CommentContext, reduced: readonly Reduction[]): CommentContext {
  if (reduced.includes("context")) return essentialContext(context);
  if (!reduced.includes("regions")) return context;

  const copy: { regions?: readonly RegionContext[] } & CommentContext = { ...context };
  delete copy.regions;
  return copy;
}

function reduceAnchor(anchor: CommentAnchor, reduced: readonly Reduction[]): CommentAnchor {
  const { quote, selector, ...rest } = anchor;
  const kept = reduced.includes("quote") ? undefined : trimQuote(quote, reduced);

  return {
    ...rest,
    ...(selector === undefined || reduced.includes("selector") ? {} : { selector }),
    ...(kept === undefined ? {} : { quote: kept }),
  };
}

function trimQuote(
  quote: TextQuote | undefined,
  reduced: readonly Reduction[],
): TextQuote | undefined {
  if (!quote) return undefined;
  return reduced.includes("quote-context") ? { exact: quote.exact } : quote;
}

/** What a fix cannot be verified without: where it was, and at what size. */
function essentialContext(context: CommentContext): CommentContext {
  return {
    url: context.url,
    viewportWidth: context.viewportWidth,
    viewportHeight: context.viewportHeight,
    contentWidth: context.contentWidth,
    devicePixelRatio: context.devicePixelRatio,
    colorScheme: context.colorScheme,
  };
}
/**
 * Who wrote the table, above it: each author once, first appearance first. A
 * set nobody signed loses the line rather than being credited to nobody.
 */
function introduce(comments: readonly Comment[]): readonly string[] {
  const names = [...new Set(comments.map((comment) => cell(comment.author.name)))].filter(Boolean);
  if (names.length === 0) return [];

  const written = comments.length === 1 ? "Comment written by" : "Comments written by";
  return [`${written} ${conjoin(names)}:`, ""];
}

/** `a`, `a and b`, `a, b and c`. `Intl` is in Node and every browser Maple runs in. */
function conjoin(names: readonly string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

function table(comments: readonly Comment[], screenshots: ReadonlyMap<string, string>): string {
  const withShots = comments.some((comment) => screenshots.has(comment.id));
  const head = ["#", "Where", "Comment", "Viewport", ...(withShots ? ["Shot"] : [])];
  const rows = comments.map((comment, index) =>
    row(comment, index + 1, withShots ? screenshots.get(comment.id) : undefined),
  );

  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows].join(
    "\n",
  );
}

function row(comment: Comment, number: number, shot: string | undefined): string {
  const cells = [
    String(number),
    where(comment.anchor),
    cell(comment.body),
    `${comment.context.viewportWidth}×${comment.context.viewportHeight}`,
    ...(shot === undefined ? [] : [shot ? `[view](${shot})` : ""]),
  ];
  return `| ${cells.join(" | ")} |`;
}

function where(anchor: CommentAnchor): string {
  const name = anchor.component ?? anchor.source ?? anchor.selector;
  return name ? `\`${cell(name)}\`` : "—";
}

/** A table cell cannot hold a pipe or a newline; an escaped pipe renders as one anywhere. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll(/\r?\n/g, "<br>").trim();
}

/** A `data:` screenshot is stripped from a pull-request body, so it is not offered. */
function hostedOnly(screenshots: ReadonlyMap<string, string> | undefined): Map<string, string> {
  const hosted = new Map<string, string>();
  for (const [id, url] of screenshots ?? []) {
    if (/^https?:\/\//i.test(url)) hosted.set(id, url);
  }
  return hosted;
}

function size(text: string): number {
  return new TextEncoder().encode(text).length;
}
