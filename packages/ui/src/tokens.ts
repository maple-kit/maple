/**
 * Every `--mk-*` the overlay declares, in one table.
 *
 * The stylesheet is built from this and nothing else, so a part never writes a
 * colour, a radius, a duration or an easing of its own. Colours and shadows are
 * themed; radii, type and motion are not. The runtime-only tokens are listed
 * in RUNTIME_TOKENS: they arrive through `setProperty`, per reviewer or per
 * painted frame, and declaring them here would give them a wrong default.
 */

/** A token with a value for each of the overlay's two schemes. */
export interface ThemedToken {
  readonly light: string;
  readonly dark: string;
}

/**
 * The prototype declares `--mk-warn` at hue 72 in light and 82 everywhere else,
 * with `--mk-warn-sub` at 82 in both. Unified on 82: the mismatch made the
 * re-verify chip's text and its wash disagree by ten degrees in light only.
 */
export const COLOR_TOKENS: Readonly<Record<string, ThemedToken>> = {
  "--mk-bg": { light: "oklch(1 0 0)", dark: "oklch(0.238 0.011 265)" },
  "--mk-sunk": { light: "oklch(0.968 0.003 265)", dark: "oklch(0.193 0.010 265)" },
  "--mk-fg": { light: "oklch(0.23 0.012 265)", dark: "oklch(0.975 0.003 265)" },
  "--mk-muted": { light: "oklch(0.53 0.014 265)", dark: "oklch(0.79 0.011 265)" },
  "--mk-faint": { light: "oklch(0.66 0.012 265)", dark: "oklch(0.665 0.012 265)" },
  "--mk-line": { light: "oklch(0.915 0.005 265)", dark: "oklch(0.365 0.012 265)" },
  "--mk-line-firm": { light: "oklch(0.86 0.007 265)", dark: "oklch(0.47 0.015 265)" },
  // The olive, lifted off both ends of #283618 / #606c38: at the hexes
  // themselves the light one read as black on white and the dark one carried
  // 2.2:1 against the overlay's own background, which is a ring nobody can
  // find. Same hue and chroma, moved until each clears 7:1 on its scheme.
  "--mk-accent": { light: "oklch(0.44 0.075 128)", dark: "oklch(0.76 0.1 122)" },
  "--mk-accent-ink": { light: "oklch(0.981 0.034 100)", dark: "oklch(0.22 0.040 128)" },
  "--mk-accent-sub": { light: "oklch(0.958 0.028 122)", dark: "oklch(0.30 0.040 124)" },
  "--mk-ok": { light: "oklch(0.52 0.11 155)", dark: "oklch(0.74 0.12 155)" },
  "--mk-ok-sub": { light: "oklch(0.955 0.03 155)", dark: "oklch(0.29 0.05 155)" },
  "--mk-warn": { light: "oklch(0.60 0.13 82)", dark: "oklch(0.82 0.13 82)" },
  "--mk-warn-sub": { light: "oklch(0.962 0.05 82)", dark: "oklch(0.31 0.06 82)" },
  "--mk-danger": { light: "oklch(0.52 0.17 27)", dark: "oklch(0.75 0.14 25)" },
  "--mk-danger-sub": { light: "oklch(0.96 0.025 25)", dark: "oklch(0.30 0.06 25)" },
  "--mk-lost": { light: "oklch(0.52 0.11 305)", dark: "oklch(0.76 0.11 305)" },
  "--mk-lost-sub": { light: "oklch(0.958 0.028 305)", dark: "oklch(0.29 0.05 305)" },
  "--mk-info": { light: "oklch(0.53 0.12 248)", dark: "oklch(0.74 0.12 248)" },
  "--mk-info-sub": { light: "oklch(0.958 0.032 248)", dark: "oklch(0.28 0.05 248)" },
  // What Maple noticed, not what a reviewer said. Around #bc6c25 in both
  // schemes: at the brick #772e25 the light one read as an error message, and
  // nothing is wrong when this shows. Never a fill, for the same reason.
  "--mk-maple": { light: "oklch(0.56 0.12 60)", dark: "oklch(0.72 0.125 62)" },
  "--mk-maple-sub": { light: "oklch(0.965 0.030 62)", dark: "oklch(0.30 0.050 58)" },
  // A screenshot's outline is pure black or pure white at 10%, chosen by the
  // overlay's scheme. A tinted neutral reads as a border on one of the two.
  "--mk-shot-edge": { light: "oklch(0 0 0 / 0.1)", dark: "oklch(1 0 0 / 0.1)" },
};

/** Depth is a shadow plus a firm border, because the background is unknown. */
export const SHADOW_TOKENS: Readonly<Record<string, ThemedToken>> = {
  "--mk-sh1": {
    light: "0 1px 2px oklch(0.2 0.02 265 / 0.08)",
    dark: "0 1px 2px oklch(0 0 0 / 0.45)",
  },
  "--mk-sh2": {
    light: "0 6px 18px oklch(0.2 0.02 265 / 0.12), 0 1px 3px oklch(0.2 0.02 265 / 0.08)",
    dark: "0 6px 18px oklch(0 0 0 / 0.5), 0 1px 3px oklch(0 0 0 / 0.35)",
  },
  "--mk-sh3": {
    light: "0 20px 48px oklch(0.2 0.02 265 / 0.20), 0 2px 8px oklch(0.2 0.02 265 / 0.10)",
    dark: "0 20px 48px oklch(0 0 0 / 0.6), 0 2px 8px oklch(0 0 0 / 0.4)",
  },
};

/** Concentric: outer = inner + padding. 5 + 2 = 7, 7 + 3 = 10. */
export const RADIUS_TOKENS: Readonly<Record<string, string>> = {
  "--mk-r": "10px",
  "--mk-r-sm": "7px",
  "--mk-r-xs": "5px",
};

/** The overlay's own stacks. It inherits no font, so `font-src` stays untouched. */
export const TYPE_TOKENS: Readonly<Record<string, string>> = {
  "--mk-font":
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  "--mk-mono": "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
};

/** Hit areas and the one press scale, so neither is written twice. */
export const SIZE_TOKENS: Readonly<Record<string, string>> = {
  "--mk-hit": "40px",
  // The island header's height, fixed so the settings panel can sit exactly
  // under it: the panel is positioned against the card, not against the header.
  "--mk-head-h": "44px",
  "--mk-press": "0.96",
  // The sheet is the panel under SHEET_BREAKPOINT_PX, so it is a width and a
  // radius rather than a variant prop. The media query redeclares both.
  "--mk-composer-w": "360px",
  "--mk-composer-r": "0",
};

/**
 * The directive's motion table, and the only durations and easings in the
 * package. Overshoot appears on entrance easing alone; every surface — open,
 * close, slide, resize, reposition — uses `--mk-ease-surface`. There is no
 * close duration longer than its open and no delay token for a close.
 */
export const MOTION_TOKENS: Readonly<Record<string, string>> = {
  "--mk-ease-surface": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--mk-ease-entrance": "cubic-bezier(0.34, 1.36, 0.64, 1)",
  "--mk-ease-swap": "ease-in-out",
  "--mk-ease-tooltip": "ease-out",

  "--mk-dur-island-open": "250ms",
  "--mk-dur-island-close": "150ms",
  "--mk-dur-composer-open": "400ms",
  "--mk-dur-composer-close": "350ms",
  "--mk-dur-tooltip": "150ms",
  "--mk-dur-swap": "150ms",
  "--mk-dur-mark-in": "500ms",
  "--mk-dur-fade": "150ms",
  "--mk-dur-shimmer": "1100ms",

  "--mk-delay-tooltip": "80ms",
  "--mk-stagger-step": "40ms",
  "--mk-stagger-cap": "240ms",

  "--mk-scale-island": "0.97",
  "--mk-scale-tooltip": "0.98",
  "--mk-rise-mark": "8px",
  "--mk-rise-card": "12px",
  "--mk-rise-row": "6px",
  "--mk-shift-composer": "100%",
  "--mk-icon-scale": "0.25",
  "--mk-icon-blur": "4px",
  "--mk-shimmer-sweep": "100%",
};

/**
 * Reduced motion reduces the motion; it never removes the feedback. Distance,
 * pre-scale and stagger collapse to nothing and every duration lands at or
 * under 100ms, so what is left of a transition is its opacity. Every entrance
 * distance is a token for that reason: a keyframe spelling `12px` keeps moving.
 */
export const REDUCED_MOTION_TOKENS: Readonly<Record<string, string>> = {
  "--mk-ease-surface": "ease-out",
  "--mk-ease-entrance": "ease-out",
  "--mk-ease-swap": "ease-out",
  "--mk-ease-tooltip": "ease-out",

  "--mk-dur-island-open": "100ms",
  "--mk-dur-island-close": "100ms",
  "--mk-dur-composer-open": "100ms",
  "--mk-dur-composer-close": "100ms",
  "--mk-dur-tooltip": "100ms",
  "--mk-dur-swap": "100ms",
  "--mk-dur-mark-in": "100ms",
  "--mk-dur-fade": "100ms",
  "--mk-dur-shimmer": "100ms",

  "--mk-delay-tooltip": "0ms",
  "--mk-stagger-step": "0ms",
  "--mk-stagger-cap": "0ms",

  "--mk-scale-island": "1",
  "--mk-scale-tooltip": "1",
  "--mk-rise-mark": "0px",
  "--mk-rise-card": "0px",
  "--mk-rise-row": "0px",
  "--mk-shift-composer": "0%",
  "--mk-icon-scale": "1",
  "--mk-icon-blur": "0px",
  "--mk-shimmer-sweep": "0%",
};

/**
 * Set with `setProperty` on one element, never declared and never written as a
 * generated rule: a rule per reviewer is a stylesheet that grows with the team.
 */
export const RUNTIME_TOKENS: readonly string[] = [
  // One rung's share of a pillar's probability, on that rung's own slot.
  "--mk-p",
  "--mk-slot",
  "--mk-slot-ink",
  "--mk-pin",
  "--mk-pin-ink",
  "--mk-x",
  "--mk-y",
  "--mk-w",
  "--mk-h",
  // The card, once the viewer has resized it.
  "--mk-card-w",
  "--mk-card-h",
];

/**
 * The composer is a panel above this and a sheet below it. It is a width, not a
 * variant prop, so it lives here rather than in a `variant="sheet"`.
 */
export const SHEET_BREAKPOINT_PX = 640;
