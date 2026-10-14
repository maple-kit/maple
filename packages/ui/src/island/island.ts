/**
 * `Maple.Island`: the one object a page at rest carries.
 *
 * It is a pill until it is asked for, and the card that replaces it carries
 * both halves of the job — what has been said here, and how to say something.
 * That is why entering comment mode has no chrome of its own: a second
 * permanent thing over the preview is wrong before anything else about it.
 * Which corner it sits in, and whether it is showing at all, are the
 * controller's. A panel opening moves the island aside rather than under it.
 */

import { watchEscape } from "@maple-kit/core/client";
import { useMaple, useMapleClient } from "@maple-kit/react";
import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { useMapleUi } from "../context.js";
import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { composeRefs } from "../slot.js";
import { numbersFor, resolutionsFor } from "./comments.js";
import { IslandContext } from "./context.js";
import { useDrag } from "./drag.js";

import type { PartProps } from "../part.js";
import type { IslandContextValue, IslandPhase } from "./context.js";
import type { Corner } from "@maple-kit/core/client";
import type { ReactNode } from "react";

const PART = "<Maple.Island>";

/** How the island starts, and what goes inside it. */
export interface IslandProps extends PartProps {
  readonly children?: ReactNode;
  /** Collapsed unless something already asked for it open. */
  readonly defaultOpen?: boolean;
}

/** The island's own corner, and the state its parts share. */
export const Island = /** @__PURE__ */ forwardRef<HTMLDivElement, IslandProps>(
  function Island(props, ref) {
    const { asChild, children, className, defaultOpen, ...rest } = props;
    const { composer, hidden, position } = useMaple();
    const value = useIslandState(defaultOpen === true);

    if (hidden) return null;

    const element = renderPart(
      "div",
      asChild,
      {
        ...rest,
        className: cx("mk-island", className),
        "data-mk-open": String(value.phase !== "closed"),
        "data-mk-corner": position,
        "data-mk-inset": String(composer.open),
        tabIndex: -1,
        ref: composeRefs(ref, value.drag.attach),
      },
      children,
    );

    return createElement(IslandContext.Provider, { value }, element);
  },
);

/**
 * Opening is immediate and closing runs the exit first, because a close that
 * waits for anything reads as a surface that did not hear the click.
 */
function useIslandState(defaultOpen: boolean): IslandContextValue {
  const { comments, composer, detail, hidden, pick, selected, tap } = useMaple();
  const client = useMapleClient();
  const { container } = useMapleUi(PART);
  const [phase, setPhase] = useState<IslandPhase>(defaultOpen ? "open" : "closed");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const contentId = useId();

  const setOpen = useCallback(
    (open: boolean) => {
      if (!open) client.select(null);
      setPhase((current) => (open ? "open" : leaving(current)));
    },
    [client],
  );
  const settled = useCallback(() => {
    setPhase((current) => (current === "closing" ? "closed" : current));
  }, []);
  const setDeveloper = useCallback(
    (on: boolean) => {
      client.setDetail(on ? "developer" : "default");
    },
    [client],
  );

  const developer = detail === "developer";
  const numbers = useMemo(() => numbersFor(comments), [comments]);
  const page = container.ownerDocument;
  const resolutions = useMemo(
    () => resolutionsFor(comments, page, developer),
    [comments, page, developer],
  );
  const snap = useCallback((corner: Corner) => client.setPosition(corner), [client]);
  const drag = useDrag(container, snap);

  useEscape({
    phase,
    pickArmed: pick.armed,
    composerOpen: composer.open,
    settingsOpen,
    setSettingsOpen,
    setOpen,
    client,
    closeTaps: tap.close,
  });

  const shown = selected === null ? phase : "open";
  const showing = shown !== "closed" && !hidden;
  useEffect(() => client.setIslandOpen(showing), [client, showing]);
  useEffect(() => () => client.setIslandOpen(false), [client]);

  return useMemo(
    () => ({
      phase: shown,
      setOpen,
      settled,
      developer,
      setDeveloper,
      settingsOpen,
      setSettingsOpen,
      contentId,
      numbers,
      comments,
      resolutions,
      selected,
      drag,
    }),
    [
      comments,
      contentId,
      developer,
      drag,
      numbers,
      resolutions,
      selected,
      setDeveloper,
      setOpen,
      settingsOpen,
      settled,
      shown,
    ],
  );
}

interface EscapeOrder {
  readonly phase: IslandPhase;
  readonly pickArmed: boolean;
  readonly composerOpen: boolean;
  readonly settingsOpen: boolean;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly setOpen: (open: boolean) => void;
  readonly client: ReturnType<typeof useMapleClient>;
  /** Shift-and-modifier taps so far. */
  readonly closeTaps: number;
}

/** An open emoji menu is newer than the composer under it, and takes the key. */
function menuOpen(event: KeyboardEvent): boolean {
  const root = event.composedPath().find((node) => node instanceof ShadowRoot);
  return root?.querySelector(".mk-emoji-menu") != null;
}

/**
 * Newest first, one layer per press: a pick, then the composer, the settings
 * and last the island. An armed pick has its own listener, which answers it.
 */
function closeTopmost(now: EscapeOrder, event: KeyboardEvent): boolean {
  if (now.pickArmed || menuOpen(event)) return false;
  if (now.composerOpen) now.client.closeComposer();
  else if (now.settingsOpen) now.setSettingsOpen(false);
  else if (now.phase === "open") now.setOpen(false);
  else return false;
  return true;
}

/** Shift and the modifier tapped: everything shuts, and the drafts stay. */
function closeAll(now: EscapeOrder): void {
  if (now.pickArmed) now.client.disarm();
  if (now.composerOpen) now.client.closeComposer();
  now.setSettingsOpen(false);
  if (now.phase === "open") now.setOpen(false);
}

function useEscape(order: EscapeOrder): void {
  const latest = useRef(order);
  latest.current = order;

  useEffect(() => {
    const stop = new AbortController();
    watchEscape({
      signal: stop.signal,
      onEscape: (event) => closeTopmost(latest.current, event),
    });
    return () => stop.abort();
  }, []);

  const seen = useRef(order.closeTaps);
  useEffect(() => {
    if (order.closeTaps === seen.current) return;
    seen.current = order.closeTaps;
    closeAll(latest.current);
  }, [order.closeTaps]);
}

/** A close runs its exit first; anything already closed stays closed. */
function leaving(phase: IslandPhase): IslandPhase {
  return phase === "open" ? "closing" : phase;
}
