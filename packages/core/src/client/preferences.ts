/**
 * Where Maple starts: the query string, then the viewer, then the application.
 *
 * A preview link is the unit of sharing, so the link carries the configuration
 * — somebody sends a designer a URL and the designer lands in the right state
 * without being told to press anything. Resolving that order is model rather
 * than view: a hook that did it is a hook a Svelte binding writes again.
 * `resolveConfig` is pure and table-tested, and the two readers around it
 * treat a throw as "nothing was stored".
 */

import { COMMENT_SHORTCUT } from "./shortcut.js";
import { CORNERS, DETAILS, THEME_PREFERENCES } from "./types.js";

import type { Logger } from "../logger/types.js";
import type { Corner, Detail, PickKind, ThemePreference } from "./types.js";

/** The key every stored preference hangs under, per origin. */
const PREFERENCES_PREFIX = "maple:prefs:";

/** What every prop defaults to when nothing else answers. */
export const MAPLE_DEFAULTS = {
  enabled: true,
  position: "bottom-right",
  detail: "default",
  hideResolved: true,
  shortcut: COMMENT_SHORTCUT,
  allowUrlOverride: true,
  theme: "auto",
} as const;

/** What an application sets on the component. Every one of them is optional. */
export interface MapleProps {
  /** False mounts nothing at all, and the query string may not undo it. */
  readonly enabled?: boolean;
  readonly position?: Corner;
  readonly detail?: Detail;
  /** What the overlay is drawn in. Defaults to `auto`: the host's opposite. */
  readonly theme?: ThemePreference;
  /** Whether resolved comments start hidden. The filter is one click away. */
  readonly hideResolved?: boolean;
  /** The bare key that arms a pick. */
  readonly shortcut?: string;
  /** Whether the query string may turn Maple **on**. Off is always allowed. */
  readonly allowUrlOverride?: boolean;
}

/** What a link asked for. Absent fields were not in the query string. */
export interface MapleQuery {
  /** `?maple=off` is always honoured; `?maple=on` needs `allowUrlOverride`. */
  readonly enabled?: boolean;
  readonly position?: Corner;
  readonly detail?: Detail;
  /** `?maple-theme=` — so a screenshot can be asked for in either scheme. */
  readonly theme?: ThemePreference;
  /** `?maple-comment=` — what a pull-request comment deep-links to. */
  readonly comment?: string;
  /** `?maple-new=` — arm this pick the moment the overlay is up. */
  readonly pick?: PickKind;
}

/** What the viewer settled on last time, on this origin. */
export interface StoredPreferences {
  readonly detail?: Detail;
  readonly position?: Corner;
  readonly theme?: ThemePreference;
}

/** Everything a surface needs before it renders anything. */
export interface MapleConfig {
  readonly enabled: boolean;
  readonly position: Corner;
  readonly detail: Detail;
  readonly theme: ThemePreference;
  readonly hideResolved: boolean;
  readonly shortcut: string;
  readonly allowUrlOverride: boolean;
  /** Select it, scroll to it and draw its ring. */
  readonly comment?: string;
  readonly pick?: PickKind;
}

/** The three sources, in the order they are asked. */
export interface ConfigInput {
  readonly query?: MapleQuery;
  readonly stored?: StoredPreferences;
  readonly props?: MapleProps;
}

/** Where a preference is read from and written to, all of it optional. */
export interface PreferencesOptions {
  /** Defaults to `localStorage`, reached behind a guard. */
  readonly storage?: Storage;
  /** Defaults to the page's own. Preferences never cross an origin. */
  readonly origin?: string;
  readonly logger?: Logger;
}

const PICKS: readonly PickKind[] = ["element", "region", "text"];

/** Narrows a query value to one of a list, or to nothing at all. */
function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((one) => one === value);
}

/** `off` is a decision; `on` is a request. Anything else said nothing. */
function switched(value: string | null): boolean | undefined {
  if (value === "off") return false;
  return value === "on" ? true : undefined;
}

/** The same shape with nothing set to `undefined`, which is not the same shape. */
type Given<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Only the fields a source actually carried, so `??` below stays honest. */
function present<T extends object>(fields: T): Given<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Given<T>;
}

/**
 * Read off a `location.search`. An unreadable value is left out rather than
 * defaulted, so a typo falls through to the next source instead of winning.
 */
export function parseMapleQuery(search: string): MapleQuery {
  const query = new URLSearchParams(search);
  const comment = query.get("maple-comment");

  return present({
    enabled: switched(query.get("maple")),
    position: oneOf(query.get("maple-pos"), CORNERS),
    detail: oneOf(query.get("maple-detail"), DETAILS),
    theme: oneOf(query.get("maple-theme"), THEME_PREFERENCES),
    comment: comment === null || comment === "" ? undefined : comment,
    pick: oneOf(query.get("maple-new"), PICKS),
  });
}

/**
 * `enabled: false` cannot be overridden into being on, whatever the link says;
 * a link saying `off` is honoured whatever the application says.
 */
function enabledFrom(input: ConfigInput, allowUrlOverride: boolean): boolean {
  const asked = input.props?.enabled ?? MAPLE_DEFAULTS.enabled;
  if (input.props?.enabled === false || input.query?.enabled === false) return false;
  return input.query?.enabled === true && allowUrlOverride ? true : asked;
}

/** The viewer's own three, in the one order: link, then them, then the app. */
function viewerFrom(input: ConfigInput): Pick<MapleConfig, "detail" | "position" | "theme"> {
  const { props, query, stored } = input;
  return {
    position: query?.position ?? stored?.position ?? props?.position ?? MAPLE_DEFAULTS.position,
    detail: query?.detail ?? stored?.detail ?? props?.detail ?? MAPLE_DEFAULTS.detail,
    theme: query?.theme ?? stored?.theme ?? props?.theme ?? MAPLE_DEFAULTS.theme,
  };
}

/**
 * Query string, then the viewer's stored preference, then props, then the
 * defaults — for everything but `enabled`, which has a rule of its own above.
 */
export function resolveConfig(input: ConfigInput = {}): MapleConfig {
  const { props, query } = input;
  const allowUrlOverride = props?.allowUrlOverride ?? MAPLE_DEFAULTS.allowUrlOverride;

  return {
    enabled: enabledFrom(input, allowUrlOverride),
    ...viewerFrom(input),
    hideResolved: props?.hideResolved ?? MAPLE_DEFAULTS.hideResolved,
    shortcut: props?.shortcut ?? MAPLE_DEFAULTS.shortcut,
    allowUrlOverride,
    ...present({ comment: query?.comment, pick: query?.pick }),
  };
}

/**
 * `localStorage` throws on *access*, not only on use — in a private window and
 * wherever site data is blocked. Everything below reaches it through this.
 */
function reach(options: PreferencesOptions): Storage | undefined {
  if (options.storage) return options.storage;
  try {
    return globalThis.localStorage;
  } catch {
    options.logger?.warn("Preferences are per-page: this browser blocks site data.");
    return undefined;
  }
}

/** Preferences never cross an origin, so the origin is part of the key. */
function keyFor(options: PreferencesOptions): string {
  return PREFERENCES_PREFIX + (options.origin ?? globalThis.location?.origin ?? "");
}

/** What was stored, or nothing. A read that throws is a read that said nothing. */
export function readPreferences(options: PreferencesOptions = {}): StoredPreferences {
  const storage = reach(options);
  if (!storage) return {};

  try {
    const raw = storage.getItem(keyFor(options));
    return raw === null ? {} : sanitised(JSON.parse(raw) as StoredPreferences);
  } catch {
    options.logger?.warn("A stored Maple preference could not be read; using the defaults.");
    return {};
  }
}

/** Storage is shared and old: a value that is no longer one of ours is dropped. */
function sanitised(stored: StoredPreferences): StoredPreferences {
  return present({
    detail: oneOf(stored.detail ?? null, DETAILS),
    position: oneOf(stored.position ?? null, CORNERS),
    theme: oneOf(stored.theme ?? null, THEME_PREFERENCES),
  });
}

/** Remembers what the viewer chose. A write that throws is a write that did not. */
export function writePreferences(next: StoredPreferences, options: PreferencesOptions = {}): void {
  const storage = reach(options);
  if (!storage) return;

  try {
    storage.setItem(keyFor(options), JSON.stringify(sanitised(next)));
  } catch {
    options.logger?.warn("A Maple preference could not be stored; it lasts this page only.");
  }
}

/** A point in the viewport, in CSS pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What the corners are corners of. `getBoundingClientRect()` satisfies it. */
export interface Frame {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The corner a dragged island belongs to, by which half of each axis its
 * middle landed in. It snaps rather than resting where it was let go: a
 * surface a millimetre off a corner reads as a surface nobody placed.
 */
export function nearestCorner(point: Point, box: Frame): Corner {
  const vertical = point.y - box.top < box.height / 2 ? "top" : "bottom";
  const horizontal = point.x - box.left < box.width / 2 ? "left" : "right";
  return `${vertical}-${horizontal}`;
}

/**
 * The configuration this page starts in, gathered from the link and the
 * viewer. Impure by design, so `resolveConfig` above can stay a table.
 */
export function readMapleConfig(
  props: MapleProps = {},
  options: PreferencesOptions = {},
): MapleConfig {
  return resolveConfig({
    query: parseMapleQuery(globalThis.location?.search ?? ""),
    stored: readPreferences(options),
    props,
  });
}
