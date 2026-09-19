/**
 * The overlay's scheme, read off the controller and never re-derived.
 *
 * `@maple-kit/core/client` already watches the host page's attributes, classes,
 * computed `color-scheme` and background luminance and re-runs on a change.
 * A second detector here would disagree with the first one eventually, and the
 * scheme a comment records would be whichever of the two answered last.
 */

import { overlaySchemeFor } from "@maple-kit/core/client";
import { useMaple } from "@maple-kit/react";
import { useMemo } from "react";

import type { Scheme } from "@maple-kit/core/client";

/** The overlay's scheme and the host's, which are not the same scheme. */
export interface OverlayTheme {
  /** What the overlay is drawn in. */
  readonly scheme: Scheme;
  /** What the host page is in, which is what a comment records. */
  readonly hostScheme: Scheme;
}

/**
 * The overlay's scheme, as the viewer last asked for it.
 *
 * The preference is the controller's, not this component's: it is remembered
 * per origin and settable from the island, so a prop here would be a second
 * source for the same fact and would win on every remount. An application
 * still chooses the default by passing `theme` to `Maple.Root`, which is read
 * once into the config the controller starts from.
 */
export function useOverlayScheme(): OverlayTheme {
  const { theme, themePreference } = useMaple();

  return useMemo(
    () => ({ scheme: overlaySchemeFor(themePreference, theme), hostScheme: theme.host }),
    [themePreference, theme],
  );
}
