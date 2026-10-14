/**
 * The mirrord preview preset.
 *
 * A preview pod serves exactly one session, so identity belongs to the pod:
 * the env override mirrord applies is read once and wins. The `mirrord-key`
 * header is the operator's own and is next; baggage is last because its filter
 * is a substring match. The host is never used: share links rewrite it.
 */

import { baggageEntry } from "./baggage.js";

import type { PreviewEnvironment, PreviewIdentity, PreviewRequest } from "./types.js";

/** Where the preset reads, each overridable for an adopter's own names. */
export interface MirrordOptions {
  /** The host passes `process.env`. The preset reads nothing itself. Defaults to `{}`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** The request header carrying the key. Defaults to `mirrord-key`; false turns it off. */
  readonly header?: string | false;
  /** The baggage entry carrying the key. Defaults to `mirrord-session`; false turns it off. */
  readonly baggage?: string | false;
  /** Env names, defaulting to `MAPLE_PREVIEW_KEY`, `MAPLE_COMMIT`, `MAPLE_PULL_REQUEST`, `MAPLE_BRANCH` and `MAPLE_REF`. */
  readonly envNames?: {
    readonly key?: string;
    readonly commit?: string;
    readonly pullRequest?: string;
    readonly branch?: string;
    readonly ref?: string;
  };
  /**
   * Whether an open head branch belongs to the identity, replacing the default
   * slug comparison. For a key that is not a branch name, such as a ticket.
   */
  readonly matches?: (head: string, identity: PreviewIdentity) => boolean;
}

type Stated = Pick<PreviewIdentity, "branch" | "commit" | "pullRequest">;

const MAX_KEY = 255;
const MAX_DIGITS = 9;
const DNS_LABEL = 63;
const SPACE = 0x20;
const DELETE = 0x7f;

/** Creates the preset. Reads `options.env` once, here, and never again. */
export function mirrord(options: MirrordOptions = {}): PreviewEnvironment {
  const env = options.env ?? {};
  const { envKey, facts } = readDeploy(env, options.envNames);
  const envKeyName = options.envNames?.key ?? "MAPLE_PREVIEW_KEY";
  const header = (options.header ?? "mirrord-key") || undefined;
  const baggage = (options.baggage ?? "mirrord-session") || undefined;

  /** The deploy's facts describe one session; another key means another session. */
  const stated = (key: string): Stated => (envKey === undefined || envKey === key ? facts : {});

  return {
    name: "mirrord",
    identify(request: PreviewRequest): Promise<PreviewIdentity | null> {
      const { headers } = request;
      const fromBaggage =
        baggage === undefined ? undefined : baggageEntry(headerOf(headers, "baggage"), baggage);
      const found: readonly (readonly [PreviewIdentity["source"], string | undefined])[] = [
        ["env", envKey],
        ["header", cleanKey(headerOf(headers, header))],
        ["baggage", cleanKey(fromBaggage)],
      ];

      const hit = found.find(
        (one): one is [PreviewIdentity["source"], string] => one[1] !== undefined,
      );
      if (hit === undefined) return Promise.resolve(null);
      return Promise.resolve({ key: hit[1], source: hit[0], ...stated(hit[1]) });
    },
    envKey: { name: envKeyName, set: envKey !== undefined },
    matches: options.matches ?? ((head, identity) => sanitise(head) === sanitise(identity.key)),
  };
}

/** What the deploy states in env: the key, and the facts that belong to that session. */
function readDeploy(
  env: Readonly<Record<string, string | undefined>>,
  names: MirrordOptions["envNames"],
): { readonly envKey: string | undefined; readonly facts: Stated } {
  const ref = cleanKey(env[names?.ref ?? "MAPLE_REF"]);
  const commit = cleanCommit(env[names?.commit ?? "MAPLE_COMMIT"]);
  const pullRequest =
    cleanNumber(env[names?.pullRequest ?? "MAPLE_PULL_REQUEST"]) ?? pullOfRef(ref);
  const branch = cleanKey(env[names?.branch ?? "MAPLE_BRANCH"]) ?? branchOfRef(ref);
  return {
    envKey: cleanKey(env[names?.key ?? "MAPLE_PREVIEW_KEY"]),
    facts: {
      ...(branch === undefined ? {} : { branch }),
      ...(commit === undefined ? {} : { commit }),
      ...(pullRequest === undefined ? {} : { pullRequest }),
    },
  };
}

/** mirrord's own slug rule: lowercase, runs of anything else to `-`, cut at a DNS label. */
function sanitise(value: string): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, "-")
    .slice(0, DNS_LABEL);
  return slug.split("-").filter(Boolean).join("-");
}

function headerOf(
  headers: Readonly<Record<string, string>>,
  name: string | undefined,
): string | undefined {
  if (name === undefined) return undefined;
  const wanted = name.toLowerCase();
  const found = Object.keys(headers).find((one) => one.toLowerCase() === wanted);
  return found === undefined ? undefined : headers[found];
}

function hasSpaceOrControl(value: string): boolean {
  return [...value].some((one) => one.codePointAt(0)! <= SPACE || one.codePointAt(0) === DELETE);
}

/** A key is short, printable and has no whitespace inside; anything else is noise. */
function cleanKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key || key.length > MAX_KEY || hasSpaceOrControl(key)) return undefined;
  return key;
}

function cleanCommit(value: string | undefined): string | undefined {
  const commit = value?.trim().toLowerCase();
  return commit !== undefined && /^[0-9a-f]{7,40}$/.test(commit) ? commit : undefined;
}

/** The number in `refs/pull/<n>/merge` or `/head`, which GitHub Actions sets as `GITHUB_REF`. */
function pullOfRef(ref: string | undefined): number | undefined {
  return cleanNumber(/^refs\/pull\/([1-9]\d*)\/(?:merge|head)$/.exec(ref ?? "")?.[1]);
}

/** The branch in `refs/heads/<branch>`: a push's `GITHUB_REF`. */
function branchOfRef(ref: string | undefined): string | undefined {
  return cleanKey(/^refs\/heads\/(.+)$/.exec(ref ?? "")?.[1]);
}

function cleanNumber(value: string | undefined): number | undefined {
  const text = value?.trim();
  if (text === undefined || !/^[1-9]\d*$/.test(text) || text.length > MAX_DIGITS) {
    return undefined;
  }
  return Number(text);
}
