/**
 * `Maple.Root`: one shadow root, one stylesheet, one controller.
 *
 * It mounts the overlay host in an effect, adopts the stylesheet, owns the
 * controller through `MapleProvider` and puts the shadow root in scope for
 * every part below it. Parts read the controller rather than props, and
 * nothing here reaches `document` while React is rendering. The props are
 * resolved once against the query string and the viewer's stored preference
 * by `readMapleConfig`: `enabled: false`, or a link, mounts nothing at all.
 */

import { readMapleConfig } from "@maple-kit/core/client";
import { createOverlayHost } from "@maple-kit/core/overlay";
import { MapleProvider } from "@maple-kit/react";
import { createElement, forwardRef, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { MapleUiContext } from "./context.js";
import { createShotStore, ShotContext } from "./shots.js";
import { OVERLAY_CSS, SCHEME_ATTRIBUTE } from "./stylesheet.js";
import { useOverlayScheme } from "./theme.js";

import type {
  MapleClient,
  MapleClientOptions,
  MapleProps,
  ThemePreference as Preference,
} from "@maple-kit/core/client";
import type { OverlayHost } from "@maple-kit/core/overlay";
import type { ReactElement, ReactNode } from "react";

/**
 * `auto` is the opposite of the host's scheme, not the same as it.
 *
 * Re-exported from `@maple-kit/core/client` so a part can name the type
 * without importing the controller's entrypoint for it.
 */
export type ThemePreference = Preference;

/** How the overlay is mounted, and what it is pointed at. */
export interface MapleRootProps extends MapleProps {
  /** The branch the comments belong to. */
  readonly branch: string;
  readonly children?: ReactNode;
  /** Added to the overlay's own layer, inside the shadow root. */
  readonly className?: string;
  /**
   * The default the viewer starts on, `auto` unless given. Their own choice,
   * made in the island's settings, is remembered per origin and wins.
   */
  readonly theme?: ThemePreference;
  /** Everything else the controller takes. `branch` comes from the prop above. */
  readonly options?: Omit<MapleClientOptions, "branch">;
  /** A controller the caller built and owns, started and destroyed by them. */
  readonly client?: MapleClient;
  /** For a host that mounts Maple with a script tag rather than a bundle. */
  readonly nonce?: string;
  /** Where the overlay's container is appended. Defaults to `document.body`. */
  readonly parent?: Element;
}

/** Mounts the overlay and puts its shadow root and controller in scope. */
export const MapleRoot = /** @__PURE__ */ forwardRef<HTMLDivElement, MapleRootProps>(
  function MapleRoot(props, ref) {
    const [config] = useState(() => readMapleConfig(props));
    const [shots] = useState(createShotStore);
    const host = useOverlayHost(config.enabled, props.nonce, props.parent);
    const options = useMemo(
      () => ({ ...props.options, branch: props.branch, config }),
      [props.options, props.branch, config],
    );

    if (!host || !config.enabled) return null;

    const className = props.className ? `mk-layer ${props.className}` : "mk-layer";
    const layer = createElement("div", { className, ref }, props.children);
    const scoped = createElement(OverlayLayer, { host }, layer);

    return createElement(
      MapleProvider,
      props.client ? { client: props.client } : { options },
      createElement(ShotContext.Provider, { value: shots }, createPortal(scoped, host.root)),
    );
  },
);

/**
 * Mounted in an effect, so nothing reaches `document` during render — which
 * costs one extra commit and is what a portal target costs.
 */
function useOverlayHost(enabled: boolean, nonce: string | undefined, parent: Element | undefined) {
  const [host, setHost] = useState<OverlayHost>();

  useEffect(() => {
    if (!enabled) return;
    const mounted = createOverlayHost({
      ...(nonce === undefined ? {} : { nonce }),
      ...(parent === undefined ? {} : { parent }),
    });
    mounted.addStyles(OVERLAY_CSS);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a portal target cannot be built during render.
    setHost(mounted);
    return () => mounted.destroy();
  }, [enabled, nonce, parent]);

  return host;
}

interface OverlayLayerProps {
  readonly host: OverlayHost;
  readonly children?: ReactNode;
}

/**
 * The scheme comes from the controller, never re-derived here, and lands
 * before paint, so a theme toggle shows no frame in the wrong one.
 */
function OverlayLayer(props: OverlayLayerProps): ReactElement {
  const theme = useOverlayScheme();
  const { container, root } = props.host;

  useLayoutEffect(() => {
    container.setAttribute(SCHEME_ATTRIBUTE, theme.scheme);
  }, [container, theme.scheme]);

  const value = useMemo(
    () => ({ root, container, scheme: theme.scheme, hostScheme: theme.hostScheme }),
    [root, container, theme.scheme, theme.hostScheme],
  );

  return createElement(MapleUiContext.Provider, { value }, props.children);
}
