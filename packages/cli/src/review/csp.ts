/**
 * Relaxing a page's Content-Security-Policy only as far as the overlay needs.
 *
 * The proxy adds one script tag, and the overlay then talks to the proxy's own
 * origin and previews a screenshot from a `blob:` URL. So three directives are
 * touched and nothing else: `script-src-elem` lets the tag run, `connect-src`
 * lets it call home, `img-src` allows `blob:`. Each is changed only when the
 * policy would otherwise block it, and only in the copy the proxy serves.
 * `docs/review.md` has the reasoning, including why a nonce is reused.
 */

/** What relaxing one policy did. */
export interface Relaxed {
  readonly policy: string;
  /** The nonce the injected tag must carry, when the policy needs one. */
  readonly nonce?: string;
  /** The directives that were changed, so the CLI can say so. */
  readonly changed: readonly string[];
}

type Directives = Map<string, string[]>;

const NONCE = /^'nonce-([^']+)'$/i;

/** Directives a script element falls back through, most specific first. */
const SCRIPT_CHAIN = ["script-src-elem", "script-src", "default-src"] as const;
const CONNECT_CHAIN = ["connect-src", "default-src"] as const;
const IMAGE_CHAIN = ["img-src", "default-src"] as const;

function parse(policy: string): Directives {
  const directives: Directives = new Map();
  for (const part of policy.split(";")) {
    const [name, ...tokens] = part.trim().split(/\s+/);
    // The first of a repeated directive is the one a browser reads.
    if (name !== undefined && name !== "" && !directives.has(name.toLowerCase())) {
      directives.set(name.toLowerCase(), tokens);
    }
  }
  return directives;
}

function serialise(directives: Directives): string {
  return [...directives].map(([name, tokens]) => [name, ...tokens].join(" ")).join("; ");
}

/** The tokens that govern, and the directive to write a changed copy under. */
function governing(directives: Directives, chain: readonly string[]): string[] | undefined {
  for (const name of chain) {
    const tokens = directives.get(name);
    if (tokens !== undefined) return tokens;
  }
  return undefined;
}

/** `'none'` beside another source is ignored by a browser, so it is dropped rather than kept. */
function withToken(tokens: readonly string[], add: string): string[] {
  return [...tokens.filter((token) => token.toLowerCase() !== "'none'"), add];
}

function has(tokens: readonly string[], ...wanted: string[]): boolean {
  return tokens.some((token) => wanted.includes(token.toLowerCase()));
}

/** The nonce a policy already has, which the tag can carry instead of a new one. */
function existingNonce(tokens: readonly string[]): string | undefined {
  return tokens.map((token) => NONCE.exec(token)?.[1]).find((nonce) => nonce !== undefined);
}

/**
 * What the tag needs, or undefined when the policy lets it run. Under
 * `strict-dynamic` only a nonce helps, since it discards `'self'`.
 */
function scriptChange(
  tokens: readonly string[],
  fresh: () => string,
): { tokens: string[]; nonce?: string } | undefined {
  if (existingNonce(tokens) !== undefined) return undefined;
  if (has(tokens, "'strict-dynamic'")) {
    const nonce = fresh();
    return { tokens: withToken(tokens, `'nonce-${nonce}'`), nonce };
  }
  if (has(tokens, "'self'", "*", "http:")) return undefined;
  return { tokens: withToken(tokens, "'self'") };
}

/**
 * Relaxes one policy. `fresh` makes a nonce, and is called only when a policy
 * that ignores hosts has none to reuse, so a policy that already carries a
 * nonce gains no second one.
 */
export function relaxPolicy(policy: string, fresh: () => string): Relaxed {
  const directives = parse(policy);
  const changed: string[] = [];
  let nonce: string | undefined;

  const script = governing(directives, SCRIPT_CHAIN);
  if (script !== undefined) {
    nonce = existingNonce(script);
    const change = scriptChange(script, fresh);
    if (change !== undefined) {
      directives.set("script-src-elem", change.tokens);
      changed.push("script-src-elem");
      nonce = change.nonce ?? nonce;
    }
  }

  const connect = governing(directives, CONNECT_CHAIN);
  if (connect !== undefined && !has(connect, "'self'", "*", "http:")) {
    directives.set("connect-src", withToken(connect, "'self'"));
    changed.push("connect-src");
  }

  const images = governing(directives, IMAGE_CHAIN);
  if (images !== undefined && !has(images, "blob:")) {
    directives.set("img-src", withToken(images, "blob:"));
    changed.push("img-src");
  }

  return {
    policy: changed.length === 0 ? policy : serialise(directives),
    changed,
    ...(nonce === undefined ? {} : { nonce }),
  };
}

/** What relaxing a header, which may carry several policies, produced. */
export interface RelaxedHeader {
  readonly header: string;
  readonly nonce?: string;
  readonly changed: readonly string[];
}

/**
 * Relaxes a `Content-Security-Policy` header value. Several policies arrive
 * comma-joined and a browser enforces all of them, so each is relaxed alone.
 */
export function relaxHeader(header: string, fresh: () => string): RelaxedHeader {
  const results = header.split(",").map((policy) => relaxPolicy(policy.trim(), fresh));
  const nonce = results.find((result) => result.nonce !== undefined)?.nonce;
  return {
    header: results.map((result) => result.policy).join(", "),
    changed: [...new Set(results.flatMap((result) => result.changed))],
    ...(nonce === undefined ? {} : { nonce }),
  };
}
