/**
 * `long`: every text as long as the page could really receive, and every
 * number at its widest. Each longer text is built from its own value, half of
 * it wrapping words and half one unbroken run, so both wrapping and
 * `overflow-wrap` are exercised. Lists keep their length.
 */

import { arrayOf, enumOf, property, typesOf, valueBranch } from "../schema/json-schema.js";
import { isMarked } from "../superjson.js";
import { isIdKey, isRecord, within } from "./values.js";

import type { Located } from "../schema/json-schema.js";

type Node = { readonly [keyword: string]: unknown };

/** How many times longer a text is made where its schema sets no `maxLength`. */
const FACTOR = 4;

/** The shortest a lengthened text is, so a two-letter value still overflows. */
const FLOOR = 32;

/** The widest plausible number: seven digits, which group as 1,234,567. */
const WIDEST = 1_234_567;

/** The longest local part an address may have (RFC 5321). */
const LOCAL_MAX = 64;

/** How deep a body is walked, which ends a cycle a schema could not. */
const DEPTH = 16;

/** Formats whose value is a fixed shape a longer string would break. */
const FIXED_FORMATS = new Set(["date", "date-time", "time", "duration", "uuid", "ipv4", "ipv6"]);

const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}\S*)?$/;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const COLOR = /^#[\da-f]{3,8}$/i;
const TOKEN = /^[a-z][\d_a-z-]{0,15}$/;
const URL_LIKE = /^https?:\/\/\S+$/i;

/** `value` with every text lengthened and every number widened. */
export function lengthen(value: unknown, at?: Located, depth = 0): unknown {
  if (isMarked(value) || depth > DEPTH) return value;
  if (Array.isArray(value)) {
    const items = within(at, at === undefined ? undefined : arrayOf(at.root, at.node).items);
    return value.map((item) => lengthen(item, items, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => {
        if (isIdKey(key)) return [key, field];
        const found = at === undefined ? undefined : property(at.root, at.node, key);
        return [key, lengthen(field, within(at, found?.schema), depth + 1)];
      }),
    );
  }
  if (typeof value === "string") return longText(value, at);
  return typeof value === "number" ? widest(value, at) : value;
}

/**
 * `text` made longer from itself: to its schema's `maxLength` exactly, else
 * four times over. An address grows its local part and a URL a path segment,
 * so both still parse. A value of a fixed shape is left as it was.
 */
export function longText(text: string, at?: Located): string {
  const node = at === undefined ? undefined : valueBranch(at.root, at.node);
  if (text.trim() === "" || isFixed(text, node, at)) return text;
  const max = typeof node?.["maxLength"] === "number" ? node["maxLength"] : undefined;
  const target = max ?? Math.max(FLOOR, text.length * FACTOR);
  if (target <= text.length) return text;
  const format = node?.["format"];
  if (format === "email" || (format === undefined && isEmail(text))) {
    return longEmail(text, target);
  }
  if (format === "uri" || format === "url" || URL_LIKE.test(text)) return longUrl(text, target);
  return longWords(text, target);
}

function isFixed(text: string, node: Node | undefined, at: Located | undefined): boolean {
  if (DATE.test(text) || UUID.test(text) || COLOR.test(text)) return true;
  if (node === undefined || at === undefined) return TOKEN.test(text);
  const format = node["format"];
  if (typeof format === "string" && FIXED_FORMATS.has(format)) return true;
  return "const" in node || "pattern" in node || enumOf(at.root, at.node).length > 0;
}

/** Half wrapping words, half one unbroken run of the text's own characters. */
function longWords(text: string, target: number): string {
  const run = text.replaceAll(/\s+/g, "");
  let out = text;
  while (out.length < target / 2) out += ` ${text}`;
  out += " ";
  while (out.length < target) out += run;
  return out.slice(0, target);
}

function longEmail(text: string, target: number): string {
  const at = text.lastIndexOf("@");
  const local = text.slice(0, at);
  const domain = text.slice(at);
  const want = Math.min(LOCAL_MAX, target - domain.length);
  if (local === "" || want <= local.length) return text;
  let grown = local;
  while (grown.length < want) grown += `.${local}`;
  return `${trimEnd(grown.slice(0, want), ".")}${domain}`;
}

/** A path segment made of the URL's own words, inserted after its origin. */
function longUrl(text: string, target: number): string {
  const url = URL.canParse(text) ? new URL(text) : undefined;
  if (url === undefined || url.origin === "null") return longWords(text, target);
  const words = `${url.hostname}${url.pathname}`.replaceAll(/[^\dA-Za-z]/g, "-");
  const source = trimEnd(words, "-").replace(/^-*/, "");
  const tail = `${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
  const need = target - url.origin.length - 1 - tail.length;
  if (need <= 0 || source === "") return text;
  let segment = source;
  while (segment.length < need) segment += `-${source}`;
  return `${url.origin}/${trimEnd(segment.slice(0, need), "-")}${tail}`;
}

/** One `@`, a dot after it, and no space: an address by shape. */
function isEmail(text: string): boolean {
  const at = text.indexOf("@");
  if (at <= 0 || at !== text.lastIndexOf("@") || /\s/.test(text)) return false;
  const dot = text.indexOf(".", at);
  return dot > at + 1 && dot < text.length - 1;
}

function trimEnd(text: string, char: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === char) end -= 1;
  return text.slice(0, end);
}

/**
 * A number at its widest, within its schema's bounds. Without a schema, a
 * fraction below one and a millisecond timestamp are left as they were.
 */
export function widest(value: number, at?: Located): number {
  const node = at === undefined ? undefined : valueBranch(at.root, at.node);
  if (!Number.isFinite(value)) return value;
  if (node === undefined || at === undefined) {
    if (Math.abs(value) >= 1e11 || (!Number.isInteger(value) && Math.abs(value) < 1)) return value;
    return signed(value, Number.isInteger(value) ? WIDEST : WIDEST + 0.89);
  }
  if ("const" in node || enumOf(at.root, at.node).length > 0) return value;
  const integer = typesOf(node).includes("integer") || Number.isInteger(value);
  const wide = signed(value, integer ? WIDEST : WIDEST + 0.89);
  const bounded =
    wide > 0 ? Math.min(wide, upper(node, integer)) : Math.max(wide, lower(node, integer));
  return Math.abs(bounded) > Math.abs(value) ? bounded : value;
}

function signed(value: number, magnitude: number): number {
  return value < 0 ? -magnitude : magnitude;
}

function upper(node: Node, integer: boolean): number {
  const { exclusiveMaximum, maximum } = node;
  const inclusive = typeof maximum === "number" ? maximum : Number.POSITIVE_INFINITY;
  if (typeof exclusiveMaximum !== "number") return inclusive;
  return Math.min(inclusive, integer ? Math.ceil(exclusiveMaximum) - 1 : exclusiveMaximum - 0.01);
}

function lower(node: Node, integer: boolean): number {
  const { exclusiveMinimum, minimum } = node;
  const inclusive = typeof minimum === "number" ? minimum : Number.NEGATIVE_INFINITY;
  if (typeof exclusiveMinimum !== "number") return inclusive;
  return Math.max(inclusive, integer ? Math.floor(exclusiveMinimum) + 1 : exclusiveMinimum + 0.01);
}
