/**
 * The pixel leaf, as path data. Artwork, not code, and not a logo system.
 *
 * Its 33 colours are the drawing's own, the way an image's pixels are its own,
 * and they are the one thing here that is not a token: do not retint them
 * toward the accent, and do not read them as a second ramp.
 *
 * Nothing but the lockup draws it. The comment mark is `leaf.ts`, one
 * silhouette in one colour, because `shape.ts` clips it at a waterline and
 * recolours it by status. This drawing survives neither. */

/** The square box. The ink is 26 cells of it, so it starts one above zero. */
export const PIXEL_LEAF_VIEW_BOX = "0 -1 28 28";

/**
 * `[colour, path]`, darkest first. One `<path>` per colour inside one `<svg>`,
 * drawn with `shape-rendering: crispEdges`: without it the cells are smoothed
 * into a blob at 24 pixels and into a poster at 1024.
 */
export const PIXEL_LEAF_SHADES: readonly (readonly [string, string])[] = [
  [
    "#2c3408",
    "M0 11h1v1h-1zM7 20h1v1h-1zM8 21h1v1h-1zM5 22h1v1h-1zM7 22h1v1h-1zM4 23h1v1h-1zM6 23h1v1h-1zM11 23h1v1h-1zM3 24h1v1h-1zM12 24h1v1h-1zM15 24h1v1h-1zM4 25h1v1h-1z",
  ],
  ["#313c07", "M2 13h1v1h-1zM8 19h1v1h-1zM9 20h1v1h-1zM10 22h1v1h-1z"],
  ["#373c08", "M17 1h1v1h-1zM21 1h1v1h-1zM20 2h1v1h-1zM3 25h1v1h-1z"],
  [
    "#354005",
    "M11 3h1v1h-1zM12 4h1v1h-1zM13 6h1v1h-1zM24 8h1v1h-1zM5 10h1v1h-1zM4 11h1v1h-1zM3 17h1v1h-1zM9 18h1v1h-1zM21 20h1v1h-1zM16 24h1v1h-1z",
  ],
  [
    "#3d440d",
    "M8 0h1v1h-1zM16 2h1v1h-1zM15 3h1v1h-1zM4 4h1v1h-1zM14 4h1v1h-1zM12 5h1v2h-1zM24 7h1v1h-1zM5 9h1v1h-1zM23 9h1v1h-1zM2 10h1v1h-1zM22 10h1v1h-1zM25 14h1v1h-1zM27 16h1v1h-1zM25 17h1v1h-1zM24 18h1v1h-1zM9 19h1v1h-1zM20 20h1v1h-1zM22 20h2v1h-2z",
  ],
  [
    "#404616",
    "M7 0h1v1h-1zM23 3h1v1h-1zM4 5h1v1h-1zM4 7h1v1h-1zM0 10h1v1h-1zM21 12h1v1h-1zM24 12h1v1h-1zM5 24h1v1h-1zM17 25h1v1h-1z",
  ],
  [
    "#414905",
    "M7 1h1v1h-1zM24 1h1v1h-1zM10 2h1v1h-1zM6 4h1v1h-1zM14 5h1v1h-1zM5 8h1v1h-1zM21 10h1v1h-1zM3 11h1v1h-1zM20 11h1v2h-1zM3 14h1v1h-1zM19 20h1v1h-1zM13 23h2v1h-2z",
  ],
  [
    "#435005",
    "M7 2h1v1h-1zM23 2h1v1h-1zM5 4h1v1h-1zM23 4h1v1h-1zM4 6h1v1h-1zM1 10h1v1h-1zM22 12h2v1h-2zM4 16h1v1h-1zM26 17h1v1h-1zM19 23h1v1h-1zM19 25h1v1h-1z",
  ],
  [
    "#4a530f",
    "M23 0h1v1h-1zM7 3h1v1h-1zM18 3h1v1h-1zM23 5h1v1h-1zM24 14h1v1h-1zM4 18h1v1h-1zM19 22h1v1h-1z",
  ],
  ["#4a5707", "M4 15h1v1h-1zM18 21h1v1h-1zM19 24h1v1h-1zM18 25h1v1h-1z"],
  ["#52541b", "M22 0h1v1h-1zM24 0h1v1h-1zM6 21h1v2h-1z"],
  ["#545710", "M19 3h1v1h-1zM23 6h1v1h-1zM26 15h1v1h-1zM5 23h1v1h-1z"],
  ["#555f02", "M9 1h1v1h-1zM14 13h1v1h-1zM24 13h1v1h-1zM5 18h1v1h-1zM7 18h1v1h-1zM10 21h1v1h-1z"],
  ["#57630d", "M6 18h1v1h-1z"],
  ["#626905", "M16 10h1v1h-1zM15 11h1v1h-1zM13 14h1v1h-1zM12 15h1v1h-1zM10 17h1v1h-1z"],
  ["#616626", "M8 20h1v1h-1zM7 21h1v1h-1z"],
  ["#66692b", "M1 12h1v1h-1zM4 24h1v1h-1z"],
  ["#667318", "M10 16h2v1h-2zM11 17h1v1h-1z"],
  ["#6f7305", "M17 9h1v1h-1z"],
  ["#6e7818", "M14 12h1v1h-1zM8 15h1v1h-1zM9 16h1v1h-1zM12 16h1v1h-1z"],
  ["#6e7d10", "M12 18h1v1h-1z"],
  ["#778015", "M18 8h1v1h-1zM16 16h4v1h-4z"],
  [
    "#7d8718",
    "M13 7h1v1h-1zM9 8h1v2h-1zM9 11h1v5h-1zM15 12h1v1h-1zM6 14h2v1h-2zM10 15h1v1h-1zM13 16h3v1h-3zM13 19h1v1h-1zM23 19h1v1h-1z",
  ],
  ["#809014", "M9 10h1v1h-1zM14 20h1v1h-1z"],
  ["#86943a", "M8 18h1v1h-1z"],
  ["#92a127", "M6 5h1v1h-1zM3 12h1v2h-1zM10 12h1v3h-1zM9 17h1v1h-1zM11 18h1v1h-1zM15 21h1v1h-1z"],
  [
    "#9fab33",
    "M17 8h1v1h-1zM16 9h1v1h-1zM22 9h1v1h-1zM6 10h1v4h-1zM1 11h2v1h-2zM5 11h1v7h-1zM2 12h1v1h-1zM4 12h1v3h-1zM7 12h1v2h-1zM7 15h1v3h-1zM16 15h2v1h-2zM8 16h1v2h-1zM4 17h1v1h-1zM21 17h1v3h-1zM10 18h1v3h-1zM23 18h1v1h-1zM11 19h2v2h-2zM22 19h1v1h-1zM13 20h1v1h-1zM18 20h1v1h-1zM14 22h2v1h-2zM18 22h1v1h-1zM15 23h3v1h-3zM17 24h1v1h-1z",
  ],
  [
    "#acb131",
    "M8 3h1v5h-1zM7 4h1v1h-1zM9 4h3v4h-3zM7 6h1v1h-1zM14 6h1v1h-1zM5 7h1v1h-1zM12 7h1v2h-1zM6 8h1v2h-1zM10 8h1v1h-1zM13 8h1v1h-1zM23 8h1v1h-1zM7 9h1v3h-1zM14 10h2v1h-2zM8 11h1v4h-1zM14 11h1v1h-1zM16 11h4v4h-4zM15 13h1v3h-1zM14 14h1v1h-1zM6 15h1v3h-1zM18 15h3v1h-3zM25 15h1v1h-1zM20 16h2v1h-2zM12 17h1v1h-1zM18 17h3v3h-3zM22 17h1v2h-1zM13 18h1v1h-1zM17 19h1v1h-1zM11 21h3v2h-3zM16 21h2v2h-2zM18 23h1v1h-1z",
  ],
  [
    "#b1b431",
    "M8 1h1v2h-1zM21 2h1v5h-1zM9 3h2v1h-2zM22 3h1v6h-1zM5 5h1v2h-1zM7 5h1v1h-1zM6 6h1v2h-1zM15 6h1v2h-1zM7 7h1v2h-1zM14 7h1v3h-1zM18 7h1v1h-1zM23 7h1v1h-1zM8 8h1v3h-1zM11 8h1v3h-1zM10 9h1v1h-1zM12 9h2v2h-2zM15 9h1v1h-1zM21 9h1v1h-1zM17 10h2v1h-2zM20 10h1v1h-1zM13 11h1v1h-1zM12 13h2v1h-2zM20 13h2v2h-2zM12 14h1v1h-1zM22 14h1v3h-1zM11 15h1v1h-1zM14 15h1v1h-1zM21 15h1v1h-1zM23 15h2v1h-2zM23 16h1v2h-1zM13 17h5v1h-5zM14 18h4v1h-4zM14 19h3v1h-3zM15 20h3v1h-3zM14 21h1v1h-1zM18 24h1v1h-1z",
  ],
  [
    "#b9b833",
    "M9 2h1v1h-1zM22 2h1v1h-1zM20 3h1v2h-1zM15 5h3v1h-3zM16 6h1v1h-1zM19 7h3v2h-3zM15 8h1v1h-1zM18 9h3v1h-3zM10 10h1v2h-1zM19 10h1v1h-1zM11 11h2v2h-2zM13 12h1v1h-1zM11 13h1v2h-1zM22 13h1v1h-1zM23 14h1v1h-1zM13 15h1v1h-1zM24 16h2v1h-2zM24 17h1v1h-1z",
  ],
  ["#babb52", "M23 1h1v1h-1zM17 2h1v1h-1zM15 4h1v1h-1zM23 13h1v1h-1zM26 16h1v1h-1zM12 23h1v1h-1z"],
  ["#c9bb37", "M22 1h1v1h-1zM16 3h2v2h-2zM18 4h2v3h-2zM20 5h1v2h-1zM17 6h1v1h-1z"],
  ["#c1be36", "M16 7h2v1h-2zM16 8h1v1h-1z"],
];
