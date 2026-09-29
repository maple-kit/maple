/**
 * Solo mode from the page's side: how a pairing arrives and where it is kept.
 *
 * `maple solo` prints a link whose fragment carries a token and the address of
 * a bridge on the reviewer's machine. A fragment is never sent to the preview
 * server, so its logs cannot hold the token; a cookie would go on every
 * request. The pairing is read the moment the client's script runs, taken out
 * of the address bar, and kept in `localStorage` behind the guard drafts use.
 * `docs/solo.md` has the argument.
 */

import type { Logger } from "../logger/types.js";

/** The request header the bridge reads the token from. */
export const SOLO_HEADER = "x-maple-solo";

/** The fragment key that carries the token, and the query key a screenshot's `img` uses. */
export const SOLO_PARAM = "maple-solo";

/** The fragment key that carries the bridge's address. */
export const BRIDGE_PARAM = "maple-bridge";

const STORAGE_PREFIX = "maple:solo:";

/** Loopback over plain http only: a link must not be able to name another host. */
const BRIDGE_ADDRESS = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;

const TOKEN_SHAPE = /^[\w-]{16,128}$/;

/** What pairing a page with a bridge leaves behind. */
export interface Pairing {
  /** The bridge's origin, such as `http://127.0.0.1:52411`. */
  readonly bridge: string;
  readonly token: string;
}

/** What the page's location and history are asked, and where the pairing is kept. */
export interface CaptureOptions {
  /** Defaults to the page's own. */
  readonly location?: Pick<Location, "hash" | "origin" | "pathname" | "search">;
  /** Defaults to the page's own. */
  readonly history?: Pick<History, "replaceState" | "state">;
  /** Defaults to `localStorage`, reached behind a guard. */
  readonly storage?: Storage;
  /** Which preview the pairing belongs to. Defaults to the page's origin. */
  readonly origin?: string;
  readonly logger?: Logger;
}

/** Held when storage is blocked, so a client-side navigation still finds it. */
const memory = new Map<string, Pairing>();

/** Whether `bridge` is an address a pairing may name. */
export function isBridgeAddress(bridge: string): boolean {
  return BRIDGE_ADDRESS.test(bridge);
}

/** Whether `token` has the shape the bridge issues. */
export function isSoloToken(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/** `previewUrl` with the pairing as its fragment, replacing any it had. */
export function soloLink(previewUrl: string, pairing: Pairing): string {
  const url = new URL(previewUrl);
  url.hash = new URLSearchParams({
    [SOLO_PARAM]: pairing.token,
    [BRIDGE_PARAM]: pairing.bridge,
  }).toString();
  return url.href;
}

/** The pairing if both parts are well-formed, whatever they were read from. */
function valid(token: string | null | undefined, bridge: string | null | undefined) {
  if (typeof token !== "string" || typeof bridge !== "string") return undefined;
  return isSoloToken(token) && isBridgeAddress(bridge) ? { bridge, token } : undefined;
}

/** The pairing a fragment carries, or nothing when it carries none or a doubtful one. */
export function parsePairing(hash: string): Pairing | undefined {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return valid(fragment.get(SOLO_PARAM), fragment.get(BRIDGE_PARAM));
}

/** The fragment without the pairing's two keys; empty when nothing else was in it. */
function withoutPairing(hash: string): string {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  fragment.delete(SOLO_PARAM);
  fragment.delete(BRIDGE_PARAM);
  const rest = fragment.toString();
  return rest === "" ? "" : `#${rest}`;
}

function reach(options: CaptureOptions): Storage | undefined {
  if (options.storage) return options.storage;
  try {
    return globalThis.localStorage;
  } catch {
    options.logger?.warn("Solo mode lasts this page only: this browser blocks site data.");
    return undefined;
  }
}

/** The page's location, or nothing where there is no page: a server render. */
function pageOf(options: CaptureOptions): CaptureOptions["location"] {
  return options.location ?? (globalThis as { location?: Location }).location;
}

function keyFor(options: CaptureOptions): string {
  return STORAGE_PREFIX + (options.origin ?? pageOf(options)?.origin ?? "");
}

function remember(key: string, pairing: Pairing, options: CaptureOptions): void {
  const storage = reach(options);
  try {
    if (storage) {
      storage.setItem(key, JSON.stringify(pairing));
      return;
    }
  } catch {
    options.logger?.warn("Solo mode could not be stored; it lasts this page only.");
  }
  memory.set(key, pairing);
}

/** What was stored, or what this page held in memory where storage is blocked. */
function recall(key: string, options: CaptureOptions): Pairing | undefined {
  const storage = reach(options);
  if (!storage) return memory.get(key);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return undefined;
    const stored = JSON.parse(raw) as Partial<Pairing>;
    return valid(stored.token, stored.bridge);
  } catch {
    return memory.get(key);
  }
}

/**
 * The pairing for this preview. A fragment that carries one wins, is stored,
 * and is taken out of the address bar with `replaceState`, which adds no
 * history entry; otherwise what was stored last time. Undefined for an
 * unpaired page, which must never go looking for a bridge.
 */
export function capturePairing(options: CaptureOptions = {}): Pairing | undefined {
  const page = pageOf(options);
  const key = keyFor(options);
  const arrived = page === undefined ? undefined : parsePairing(page.hash);

  if (page !== undefined && arrived !== undefined) {
    remember(key, arrived, options);
    strip(page, options);
    return arrived;
  }
  return recall(key, options);
}

/** Forgets the pairing, so the page is a guest again. */
export function forgetPairing(options: CaptureOptions = {}): void {
  const key = keyFor(options);
  memory.delete(key);
  try {
    reach(options)?.removeItem(key);
  } catch {
    options.logger?.warn("Solo mode could not be cleared from storage.");
  }
}

/** Only our two keys go: a fragment the host application uses for itself stays. */
function strip(page: NonNullable<CaptureOptions["location"]>, options: CaptureOptions): void {
  const history = options.history ?? globalThis.history;
  const address = `${page.pathname}${page.search}${withoutPairing(page.hash)}`;
  try {
    history?.replaceState(history.state, "", address);
  } catch {
    options.logger?.warn("The solo pairing could not be removed from the address bar.");
  }
}
