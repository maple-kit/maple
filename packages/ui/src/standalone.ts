/**
 * The overlay as one script, for a page that has no Maple in its build.
 *
 * `maple review` serves this from its proxy and adds a tag for it to the app's
 * HTML, so React is bundled in (the app may have another version, or none) and
 * the script reads what it needs from the tag's own `data-` attributes. It is
 * the same `<Maple>` an application would mount; nothing here is a second
 * implementation. It stands down when the page already mounted one.
 */

import { installSourceLocator, OVERLAY_MARKER } from "@maple-kit/core/anchor";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { Maple } from "./maple.js";

/** Set on the root element so the proxy, a test and a person can see what happened. */
const STATE_ATTRIBUTE = "data-maple-review";

/** After the app's own scripts have run, a mount of its own is in the page. */
const SETTLE_MS = 400;

const script = document.currentScript;

function attribute(name: string): string | undefined {
  return script?.getAttribute(`data-${name}`) ?? undefined;
}

function mount(): void {
  if (document.querySelector(`[${OVERLAY_MARKER}]`) !== null) {
    document.documentElement.setAttribute(STATE_ATTRIBUTE, "stood-down");
    return;
  }

  const root = attribute("root");
  const basePath = attribute("base-path");
  const appDir = attribute("app-dir");
  installSourceLocator({
    ...(root === undefined ? {} : { root }),
    ...(appDir === undefined ? {} : { appDir }),
  });

  createRoot(document.createElement("div")).render(
    createElement(Maple, {
      branch: attribute("branch") ?? "local",
      ...(basePath === undefined ? {} : { options: { basePath } }),
    }),
  );
  document.documentElement.setAttribute(STATE_ATTRIBUTE, "mounted");
}

function afterLoad(): void {
  setTimeout(mount, SETTLE_MS);
}

if (document.readyState === "complete") afterLoad();
else addEventListener("load", afterLoad, { once: true });
