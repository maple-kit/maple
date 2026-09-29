/**
 * Putting the overlay's script tag into an HTML response.
 *
 * Plain string work, because the proxy has to add exactly one tag and must not
 * reserialise the page: a parser that "fixes" the app's markup would change
 * what the reviewer is looking at.
 */

import { relaxHeader } from "./csp.js";

/** The tag's attributes, which the overlay script reads back from `document.currentScript`. */
export interface OverlayTag {
  readonly src: string;
  readonly branch: string;
  readonly basePath: string;
  readonly root: string;
  readonly nonce?: string;
}

/** A page with the tag put in. */
export interface Injected {
  readonly html: string;
  /** False when the page already carries the tag, so it is not added twice. */
  readonly added: boolean;
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeAttribute(value: string): string {
  return value.replaceAll(/[&"<>]/g, (char) => ESCAPES[char] ?? char);
}

/** The `<script>` element for the overlay. */
export function overlayTag(tag: OverlayTag): string {
  const attributes = [
    ["src", tag.src],
    ["data-branch", tag.branch],
    ["data-base-path", tag.basePath],
    ["data-root", tag.root],
    ...(tag.nonce === undefined ? [] : [["nonce", tag.nonce]]),
  ] as const;
  const written = attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`);
  return `<script ${written.join(" ")}></script>`;
}

/** Adds the tag before `</body>`, or at the end of a page that has none. */
export function injectOverlay(html: string, tag: OverlayTag): Injected {
  if (html.includes(`src="${tag.src}"`)) return { html, added: false };
  const element = overlayTag(tag);
  const at = html.toLowerCase().lastIndexOf("</body>");
  return {
    html: at === -1 ? `${html}${element}` : `${html.slice(0, at)}${element}${html.slice(at)}`,
    added: true,
  };
}

/** A `<meta>` that carries a policy, and the quoted `content` inside it. */
const META_POLICY = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;
const CONTENT = /\bcontent\s*=\s*(["'])(.*?)\1/i;

/**
 * Relaxes a policy carried in a `<meta>` the same way the header is, since a
 * page can use either and both are enforced.
 */
export function relaxMeta(
  html: string,
  fresh: () => string,
): { html: string; nonce?: string; changed: readonly string[] } {
  let nonce: string | undefined;
  const changed = new Set<string>();

  const relaxed = html.replaceAll(META_POLICY, (meta) =>
    meta.replace(CONTENT, (whole, quote: string, policy: string) => {
      const result = relaxHeader(policy, fresh);
      nonce ??= result.nonce;
      for (const directive of result.changed) changed.add(directive);
      return `content=${quote}${result.header}${quote}`;
    }),
  );
  return { html: relaxed, changed: [...changed], ...(nonce === undefined ? {} : { nonce }) };
}
