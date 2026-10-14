/**
 * What every part below `Maple.Root` reads, and the one error a misuse gives.
 *
 * The two schemes are separate fields on purpose. `scheme` is the overlay's,
 * which is the opposite of the host's so a guest on the page is visible;
 * `hostScheme` is what a comment records, which is always what the reviewer was
 * actually looking at. Conflating them writes the wrong one into the wire.
 */

import { createContext, useContext } from "react";

import type { Surface } from "./surface.js";
import type { Scheme } from "@maple-kit/core/client";

/** The shadow root, and the two schemes, for the parts inside it. */
export interface MapleUiContextValue {
  /** Where every part renders. One per `Maple.Root`, styled only by adoption. */
  readonly root: ShadowRoot;
  /** The element carrying the shadow root; `:host` in the stylesheet. */
  readonly container: HTMLElement;
  /** The overlay's scheme: the opposite of the host's. */
  readonly scheme: Scheme;
  /** The host page's scheme. This is the one a comment records. */
  readonly hostScheme: Scheme;
  /** The branch, label and pull request this root is pointed at, props over route. */
  readonly surface: Surface;
}

/** Internal: `Maple.Root` is the only supported way to fill this. */
export const MapleUiContext = /** @__PURE__ */ createContext<MapleUiContextValue | null>(null);

/** Thrown by a part rendered outside `<Maple.Root>`. */
export class MapleUiContextError extends Error {
  override readonly name = "MapleUiContextError";

  constructor(part: string) {
    super(`${part} was rendered outside <Maple.Root>. Every part needs one above it.`);
  }
}

/** The shadow root and the schemes, or a readable error rather than a null. */
export function useMapleUi(part: string): MapleUiContextValue {
  const value = useContext(MapleUiContext);
  if (value === null) throw new MapleUiContextError(part);
  return value;
}
