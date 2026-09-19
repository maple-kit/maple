/**
 * The picking session: the listeners that run only while a pick is armed.
 *
 * Kept out of the component so the rules — which gesture each kind listens
 * for, what cancels, what cycles — are one function over an `AbortSignal`
 * rather than four effects that have to agree about teardown. Everything it
 * calls lives in `@maple-kit/core/overlay`; this decides when.
 */

import { startElementPicking, startRegionPicking, startTextPicking } from "@maple-kit/core/overlay";

import type { PickKind } from "@maple-kit/core/client";
import type { Pick, Rect } from "@maple-kit/core/overlay";

/** What a running session reports back. */
export interface SessionHandlers {
  /** True for an event on the overlay's own controls, which is never a pick. */
  readonly ignore: (event: Event) => boolean;
  /** The pointer moved over something pickable, or off everything. */
  readonly onHover: (pick: Pick | undefined) => void;
  /** A rectangle being dragged, so the band can be drawn as it grows. */
  readonly onDraw: (rect: Rect | undefined) => void;
  readonly onPick: (pick: Pick) => void;
}

/** Starts the listeners for one kind. Aborting the signal removes every one. */
export function startSession(kind: PickKind, signal: AbortSignal, handlers: SessionHandlers): void {
  if (kind === "element") return element(signal, handlers);
  return kind === "region" ? region(signal, handlers) : text(signal, handlers);
}

function element(signal: AbortSignal, handlers: SessionHandlers): void {
  startElementPicking({
    signal,
    ignore: handlers.ignore,
    onHover: handlers.onHover,
    onPick: handlers.onPick,
  });
}

function region(signal: AbortSignal, handlers: SessionHandlers): void {
  startRegionPicking({
    signal,
    ignore: handlers.ignore,
    onDraw: handlers.onDraw,
    onPick: (pick) => {
      handlers.onDraw(undefined);
      handlers.onPick(pick);
    },
  });
}

function text(signal: AbortSignal, handlers: SessionHandlers): void {
  startTextPicking({
    signal,
    ignore: handlers.ignore,
    onHover: handlers.onHover,
    onPick: handlers.onPick,
  });
}
