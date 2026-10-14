/**
 * LaunchDarkly's browser SDK, read on the wire: its flag poll,
 * `/sdk/evalx/{env}/contexts/{context}` (or a REPORT to `…/context`), and its
 * stream's `put`, `patch` and `delete`. The format is the SDK's FDv1, its
 * default; `docs/mock.md` says what was verified and against which release.
 */

import { flagType } from "../flag-source.js";
import { seenFlags } from "../flags.js";
import { pathPattern } from "../rest.js";

import type { Flags, FlagSource } from "../flag-source.js";
import type { FlagValue } from "@maple-kit/core/mock";

/** Where the SDK is pointed, when it is not at LaunchDarkly's own hosts. */
export interface LaunchDarklyOptions {
  /**
   * The SDK's `baseUri` (3.x: `baseUrl`). Absent, both SDKs' default hosts.
   */
  readonly baseUri?: string;
  /** The SDK's `streamUri`. Defaults to `https://clientstream.launchdarkly.com`. */
  readonly streamUri?: string;
}

/**
 * Above any version LaunchDarkly sends: the SDK drops a `patch` not above the
 * version it holds, so a real change never replaces a named flag.
 */
const HELD_VERSION = Number.MAX_SAFE_INTEGER;

/** Where each SDK polls by default: 4.x (`@launchdarkly/js-client-sdk`), then 3.x. */
const DEFAULT_BASES = ["https://clientsdk.launchdarkly.com", "https://app.launchdarkly.com"];

const POLL = /\/sdk\/evalx\/[^/]+\/(?:contexts\/[^/]+|context)$/;
const STREAM = /\/(?:eval\/[^/]+\/[^/]+|ping\/[^/]+)$/;

/** LaunchDarkly's browser SDK as a flag source, for `installMock({ flags })`. */
export function launchDarklyFlags(options: LaunchDarklyOptions = {}): FlagSource {
  const bases = (options.baseUri === undefined ? DEFAULT_BASES : [options.baseUri]).map(
    (uri) => new URL(uri),
  );
  const stream = new URL(options.streamUri ?? "https://clientstream.launchdarkly.com");
  return {
    name: "launchdarkly",
    claims(request) {
      const url = new URL(request.url);
      const at = bases.some((base) => url.origin === base.origin && under(url, base));
      return at && POLL.test(url.pathname);
    },
    read: values,
    write,
    stream: {
      claims(href) {
        const url = new URL(href, bases[0]);
        return url.origin === stream.origin && under(url, stream) && STREAM.test(url.pathname);
      },
      event,
    },
  };
}

/** The SDK's `flag-used` inspector, structurally: `options.inspectors` takes it. */
export interface LaunchDarklyUsageInspector {
  readonly type: "flag-used";
  readonly name: string;
  /** Synchronous, so the route is the one the flag was read on. */
  readonly synchronous: true;
  method(flagKey: string, detail: { readonly value: unknown }): void;
}

/** The SDK's evaluation hook, structurally: `options.hooks` takes it. */
export interface LaunchDarklyUsageHook {
  getMetadata(): { readonly name: string };
  afterEvaluation(
    context: { readonly flagKey: string },
    data: { readonly [index: string]: unknown },
    detail: { readonly value: unknown },
  ): { readonly [index: string]: unknown };
}

function used(key: string, value: unknown): void {
  if (typeof location === "undefined") return;
  const real = value === undefined ? null : (value as FlagValue);
  const route = pathPattern(location.pathname);
  seenFlags().recordUsed({ key, route, type: flagType(real), value: real });
}

/**
 * Tells the box which flags the page reads, so it lists those and not every
 * flag in the account. Pass it where the host creates the client:
 * `options: { inspectors: [launchDarklyUsage()] }`.
 */
export function launchDarklyUsage(): LaunchDarklyUsageInspector {
  return {
    type: "flag-used",
    name: "maple-mock",
    synchronous: true,
    method: (key, detail) => used(key, detail.value),
  };
}

/** The same as `launchDarklyUsage`, as an evaluation hook: `options: { hooks: [launchDarklyUsageHook()] }`. */
export function launchDarklyUsageHook(): LaunchDarklyUsageHook {
  return {
    getMetadata: () => ({ name: "maple-mock" }),
    afterEvaluation(context, data, detail) {
      used(context.flagKey, detail.value);
      return data;
    },
  };
}

/** Whether `url` is under the path a URI option carries, such as a proxy's `/ld`. */
function under(url: URL, root: URL): boolean {
  const prefix = root.pathname.replace(/\/$/, "");
  return prefix === "" || url.pathname.startsWith(`${prefix}/`);
}

type Entries = Record<string, Record<string, unknown>>;

function values(body: unknown): Flags | undefined {
  if (!isRecord(body)) return undefined;
  const found: Record<string, FlagValue> = {};
  for (const [key, entry] of Object.entries(body)) {
    if (isRecord(entry) && entry["value"] !== undefined) found[key] = entry["value"] as FlagValue;
  }
  return found;
}

/**
 * Each named flag answered with a version no real change passes. Its
 * variation and reason describe the real evaluation, so they are dropped.
 */
function write(body: unknown, flags: Flags): unknown {
  if (!isRecord(body)) return body;
  const entries: Entries = { ...(body as Entries) };
  for (const [key, value] of Object.entries(flags)) {
    const kept = { ...entries[key] };
    delete kept["reason"];
    delete kept["variation"];
    entries[key] = { ...kept, value, version: HELD_VERSION };
  }
  return entries;
}

/** A `put` is the whole set, so it is rewritten; a `patch` or `delete` to a named flag is dropped. */
function event(type: string, data: string, flags: Flags): string | undefined {
  if (type !== "put" && type !== "patch" && type !== "delete") return data;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return data;
  }
  if (type === "put") return JSON.stringify(write(parsed, flags));
  const key = isRecord(parsed) ? parsed["key"] : undefined;
  return typeof key === "string" && Object.hasOwn(flags, key) ? undefined : data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
