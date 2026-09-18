/**
 * What the page looked like when the comment was written.
 *
 * Primitives only: widths, ratios, a media query's name. Never a conclusion
 * like a zoom percentage, because there is no API for zoom and a guessed
 * number is worse than an absent one. A readable badge resolves most layout
 * complaints without reopening anything.
 */

/** Sizes, in CSS pixels unless stated. */
export interface ViewportContext {
  /** `innerWidth`: the window, including any scrollbar. */
  readonly width: number;
  readonly height: number;
  /** `documentElement.clientWidth`: what the layout actually had. */
  readonly contentWidth: number;
  /** Device pixel ratio, which pinch-zoom also moves. */
  readonly dpr: number;
  /** The visual viewport's scale, when the browser exposes one. */
  readonly scale?: number;
}

/** A layout region that was open, found without the application's help. */
export interface RegionContext {
  /** `dialog`, `complementary`, `navigation`, or the element's tag name. */
  readonly role: string;
  /** Accessible name, when it has one a reviewer would recognise. */
  readonly label?: string;
  /** Rendered width, so "the sidebar was open" carries a number. */
  readonly width: number;
}

/** Everything the badge on a comment is built from. */
export interface PageContext {
  readonly url: string;
  readonly viewport: ViewportContext;
  readonly scheme: "dark" | "light";
  /** Name of the first matching breakpoint, when a list was configured. */
  readonly breakpoint?: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly reducedMotion: boolean;
  readonly regions: readonly RegionContext[];
  /** Whatever the application's own hook returned. */
  readonly layout?: Readonly<Record<string, unknown>>;
  /** ISO 8601, UTC. */
  readonly capturedAt: string;
}

/** How much the capture is told about the application. */
export interface CaptureOptions {
  /** Breakpoint name to media query. The first match wins, so order matters. */
  readonly breakpoints?: readonly (readonly [name: string, query: string])[];
  /** The application's own description of its layout. */
  readonly layout?: () => Readonly<Record<string, unknown>>;
}

const REGION_SELECTOR =
  '[role="dialog"], [role="complementary"], [role="navigation"], dialog[open], details[open], [aria-expanded="true"], [data-state="open"]';

/** The smallest a region can be and still be worth recording. */
const MINIMUM_REGION_WIDTH = 24;

/** Reads the page's current shape. */
export function captureContext(options: CaptureOptions = {}): PageContext {
  const breakpoint = firstMatching(options.breakpoints);
  const layout = options.layout?.();

  return {
    url: location.href,
    viewport: viewport(),
    scheme: matches("(prefers-color-scheme: dark)") ? "dark" : "light",
    ...(breakpoint === undefined ? {} : { breakpoint }),
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reducedMotion: matches("(prefers-reduced-motion: reduce)"),
    regions: regions(),
    ...(layout === undefined ? {} : { layout }),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * The badge a reviewer reads, for example
 * `1440 window · 1020 content · dark · lg · dialog open`.
 */
export function formatContext(context: PageContext): string {
  const parts = [
    `${context.viewport.width} window`,
    `${context.viewport.contentWidth} content`,
    context.scheme,
    ...(context.breakpoint ? [context.breakpoint] : []),
    ...context.regions.map((region) => `${region.label ?? region.role} open`),
  ];
  return parts.join(" · ");
}

function viewport(): ViewportContext {
  const visual = window.visualViewport;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    contentWidth: document.documentElement.clientWidth,
    dpr: window.devicePixelRatio,
    ...(visual ? { scale: visual.scale } : {}),
  };
}

function firstMatching(breakpoints: CaptureOptions["breakpoints"]): string | undefined {
  return breakpoints?.find(([, query]) => matches(query))?.[0];
}

function matches(query: string): boolean {
  return window.matchMedia(query).matches;
}

function regions(): RegionContext[] {
  const found: RegionContext[] = [];
  for (const element of document.querySelectorAll(REGION_SELECTOR)) {
    const width = element.getBoundingClientRect().width;
    if (width < MINIMUM_REGION_WIDTH) continue;

    const label = accessibleName(element);
    found.push({
      role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
      ...(label === undefined ? {} : { label }),
      width: Math.round(width),
    });
  }
  return found;
}

function accessibleName(element: Element): string | undefined {
  const label = element.getAttribute("aria-label")?.trim();
  if (label) return label;

  const id = element.getAttribute("aria-labelledby");
  const referenced = id ? document.getElementById(id)?.textContent?.trim() : undefined;
  return referenced || undefined;
}
