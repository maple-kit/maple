/**
 * What a comment remembers about where it was left, and what came of trying to
 * find that place again.
 *
 * The rungs are ordered most durable first. A comment records as many as it
 * can, because which ones survive is not knowable when it is written: a
 * rebuild changes class hashes, an edit changes the text, a deploy changes the
 * line. docs/tagger.md covers the two attributes a build can supply.
 */

/** A quoted passage, recorded the way the W3C Web Annotation model records one. */
export interface TextQuote {
  /** The text the comment was left on. */
  readonly exact: string;
  /** Text immediately before it, for telling two identical passages apart. */
  readonly prefix?: string;
  /** Text immediately after it, for the same reason. */
  readonly suffix?: string;
  /** Character offset it was at, used only to break a tie. */
  readonly offset?: number;
}

/** Everything recorded about where a comment was left. Every field is optional. */
export interface Anchor {
  /** `data-maple-key`, set by the application. Survives anything but deletion. */
  readonly key?: string;
  /** `data-maple-src`, written by the tagger as `path:line:column`. */
  readonly source?: string;
  /** `data-maple-name`, the component the element is written in. */
  readonly component?: string;
  /** The passage itself, which survives a rebuild but not a rewrite. */
  readonly quote?: TextQuote;
  /** A CSS path. Last resort: modern class names are hashes, so it breaks often. */
  readonly selector?: string;
}

/** The rungs of the cascade, in the order they are tried. */
export const RUNGS = ["key", "source", "component", "quote", "selector"] as const;

/** One rung of the cascade. */
export type Rung = (typeof RUNGS)[number];

/** Why an anchor could not be placed. Each reads differently to a reviewer. */
export type OrphanReason =
  /** Nothing was recorded to search for. */
  | "empty"
  /** Nothing on the page matches any rung. */
  | "missing"
  /** Several things match and nothing recorded separates them. */
  | "ambiguous"
  /** The passage is still there but has changed too much to trust. */
  | "changed";

/** The anchor was placed. */
export interface Resolved {
  readonly status: "resolved";
  /** The element the comment points at. */
  readonly element: Element;
  /** The passage itself, when a text rung placed it. */
  readonly range?: Range;
  /** Which rung placed it. */
  readonly by: Rung;
  /** Between 0 and 1. A lower rung is worth less even when it matched exactly. */
  readonly confidence: number;
}

/** The anchor could not be placed, and says so rather than guessing. */
export interface Orphaned {
  readonly status: "orphaned";
  readonly reason: OrphanReason;
  /** Which rungs were tried, so the reviewer can be told what was looked for. */
  readonly tried: readonly Rung[];
}

/** What resolving an anchor produces. */
export type Resolution = Orphaned | Resolved;
