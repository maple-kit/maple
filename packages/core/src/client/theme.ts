/**
 * What scheme the host page is in, and therefore what scheme the overlay is not.
 *
 * Two facts that must never be conflated: the overlay's scheme is the opposite
 * of the host's, so a guest on the page is visible rather than camouflaged;
 * the scheme a comment records is the host's, always, because that is what the
 * reviewer was looking at. Reading the signals is split from judging them so
 * the judgement is table-testable without a browser.
 */

import type { Scheme, ThemePreference, ThemeSource, ThemeState } from "./types.js";

/** Everything the detector is allowed to look at, already read off the page. */
export interface ThemeSignals {
  /** `data-theme` on the root, when the application sets one. */
  readonly theme?: string | undefined;
  /** `data-mode`, the other common spelling of the same thing. */
  readonly mode?: string | undefined;
  readonly classNames?: readonly string[] | undefined;
  /** The root's `color-scheme`, inline or computed. */
  readonly colorScheme?: string | undefined;
  /** The first opaque ancestor's background, as the browser serialised it. */
  readonly background?: string | undefined;
  /** `(prefers-color-scheme: dark)`. A tiebreak, never better than a tiebreak. */
  readonly prefersDark?: boolean | undefined;
}

/** Above this relative luminance a background is read as a light page. */
const LIGHT_ABOVE = 0.5;

/** sRGB coefficients from the WCAG relative-luminance definition. */
const COEFFICIENTS = [0.2126, 0.7152, 0.0722] as const;

/** Decides the host's scheme and says which signal decided it. */
export function hostScheme(signals: ThemeSignals): { scheme: Scheme; source: ThemeSource } {
  const declared = named(signals.theme) ?? named(signals.mode);
  if (declared) return { scheme: declared, source: "attribute" };

  const fromClass = classScheme(signals.classNames);
  if (fromClass) return { scheme: fromClass, source: "class" };

  const declaredScheme = named(signals.colorScheme);
  if (declaredScheme) return { scheme: declaredScheme, source: "color-scheme" };

  const luminance = relativeLuminance(signals.background);
  if (luminance !== undefined) {
    return { scheme: luminance > LIGHT_ABOVE ? "light" : "dark", source: "luminance" };
  }
  return { scheme: signals.prefersDark ? "dark" : "light", source: "preference" };
}

/** The host's scheme plus the overlay's, which is its opposite. */
export function themeFrom(signals: ThemeSignals): ThemeState {
  const { scheme, source } = hostScheme(signals);
  return { host: scheme, overlay: scheme === "dark" ? "light" : "dark", source };
}

/**
 * What the overlay is actually drawn in, once the viewer has had their say.
 *
 * `auto` is the opposite of the host page, which is the default and the reason
 * the overlay is legible on a site whose own theme nobody here controls. The
 * other two are taken literally: a reviewer comparing two screenshots wants
 * the same chrome in both, whatever the page under it is doing.
 */
export function overlaySchemeFor(preference: ThemePreference, theme: ThemeState): Scheme {
  return preference === "auto" ? theme.overlay : preference;
}

/**
 * The relative luminance of an `rgb()` or `rgba()` colour, or undefined for a
 * transparent or unrecognised one. An unrecognised colour falls through to the
 * next signal rather than being guessed at.
 */
export function relativeLuminance(color: string | undefined): number | undefined {
  const channels = parseRgb(color);
  if (!channels) return undefined;

  const linear = channels.map(toLinear);
  return COEFFICIENTS.reduce((total, weight, index) => total + weight * (linear[index] ?? 0), 0);
}

/** A single-valued `color-scheme`; `light dark` says nothing and is skipped. */
function named(value: string | undefined): Scheme | undefined {
  const word = value?.trim().toLowerCase();
  if (word === "dark" || word === "light") return word;
  return undefined;
}

function classScheme(classNames: readonly string[] | undefined): Scheme | undefined {
  if (!classNames) return undefined;
  if (classNames.includes("dark")) return "dark";
  return classNames.includes("light") ? "light" : undefined;
}

function parseRgb(color: string | undefined): [number, number, number] | undefined {
  const match = /^rgba?\(([^)]+)\)$/i.exec(color?.trim() ?? "");
  if (!match) return undefined;

  const parts = match[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const [red, green, blue, alpha] = parts;
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return undefined;
  if (alpha !== undefined && alpha < 1) return undefined;
  return [red!, green!, blue!];
}

function toLinear(channel: number): number {
  const ratio = channel / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** The page the detector reads. Structural, so a test can hand it a stub. */
export interface ThemeView {
  readonly document: Document;
  matchMedia(query: string): { readonly matches: boolean };
  getComputedStyle(element: Element): CSSStyleDeclaration;
}

/** How the theme is watched. */
export interface ThemeWatchOptions {
  /** Defaults to the document element. */
  readonly root?: Element;
  readonly view: ThemeView;
  onChange(theme: ThemeState): void;
}

/** A running theme watch. */
export interface ThemeWatch {
  current(): ThemeState;
  stop(): void;
}

/** Reads every signal off the page in one pass. */
export function readThemeSignals(root: Element, view: ThemeView): ThemeSignals {
  const computed = view.getComputedStyle(root);
  const inline = root instanceof HTMLElement ? root.style.colorScheme : "";

  return {
    theme: root.getAttribute("data-theme") ?? undefined,
    mode: root.getAttribute("data-mode") ?? undefined,
    classNames: [...root.classList],
    colorScheme: inline || computed.colorScheme,
    background: firstOpaqueBackground(root, view),
    prefersDark: view.matchMedia("(prefers-color-scheme: dark)").matches,
  };
}

/**
 * Re-reads on any change to the root's `class` or its `data-*` attributes: a
 * reviewer will toggle the site's theme in the middle of writing a comment,
 * and a stale overlay scheme is the one that disappears into the page.
 */
export function watchTheme(options: ThemeWatchOptions): ThemeWatch {
  const root = options.root ?? options.view.document.documentElement;
  let theme = themeFrom(readThemeSignals(root, options.view));

  const observer = new MutationObserver((records) => {
    if (!records.some(isThemeAttribute)) return;
    const next = themeFrom(readThemeSignals(root, options.view));
    if (next.host === theme.host && next.source === theme.source) return;
    theme = next;
    options.onChange(next);
  });

  observer.observe(root, { attributes: true });
  return { current: () => theme, stop: () => observer.disconnect() };
}

function isThemeAttribute(record: MutationRecord): boolean {
  const name = record.attributeName ?? "";
  return name === "class" || name === "style" || name.startsWith("data-");
}

/** The nearest background that is actually painted, body outwards. */
function firstOpaqueBackground(root: Element, view: ThemeView): string | undefined {
  let element: Element | null = view.document.body ?? root;
  while (element) {
    const background = view.getComputedStyle(element).backgroundColor;
    if (relativeLuminance(background) !== undefined) return background;
    element = element.parentElement;
  }
  return undefined;
}
