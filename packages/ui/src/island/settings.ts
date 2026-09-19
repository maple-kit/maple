/**
 * `Maple.Settings`: two switches behind one control in the header.
 *
 * A visible row of settings is a row every reviewer reads once and then reads
 * past forever. The icon is sliders rather than a gear: a gear at 13px with a
 * hover rotation reads as a sun. Hiding resolved is the controller's setting,
 * because it changes the list every other surface reads as well.
 */

import { THEME_PREFERENCES } from "@maple-kit/core/client";
import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useId } from "react";

import { CogIcon } from "../icons/cog.js";
import { useIsland } from "./context.js";
import {
  CORNER_LABELS,
  CORNER_ORDER,
  ISLAND_COPY,
  SETTINGS_COPY,
  THEME_LABELS,
  THEME_TITLES,
} from "./language.js";
import { cx, renderPart } from "./part.js";

import type { PartProps } from "./part.js";
import type { Corner, ThemePreference } from "@maple-kit/core/client";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";

/** The control. Its children replace the icon inside it. */
export interface SettingsProps extends PartProps {
  readonly children?: ReactNode;
}

const PART = "<Maple.Settings>";

/** The sliders control, and the panel it opens under the header. */
export const Settings = /** @__PURE__ */ forwardRef<HTMLButtonElement, SettingsProps>(
  function Settings(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const island = useIsland(PART);
    const { settingsOpen: open, setSettingsOpen: setOpen } = island;
    const panelId = useId();

    const button = renderPart(
      "button",
      asChild,
      {
        type: "button",
        ...rest,
        "aria-controls": panelId,
        "aria-expanded": open,
        "aria-label": ISLAND_COPY.settings,
        className: cx("mk-iconbtn mk-hit", className),
        onClick: () => setOpen(!open),
        ref,
      },
      children ?? createElement(CogIcon),
    );

    return createElement(
      "span",
      { className: "mk-settings-anchor" },
      button,
      open ? createElement(Panel, { id: panelId, onClose: () => setOpen(false) }) : null,
    );
  },
);

interface PanelProps {
  readonly id: string;
  readonly onClose: () => void;
}

/**
 * Dismissed by Escape or by focus leaving it. A capture-phase click on the page
 * outlives the panel that wanted it, and crosses no shadow boundary anyway.
 */
function Panel(props: PanelProps): ReactNode {
  const client = useMapleClient();
  const { position, showResolved, themePreference } = useMaple();
  const island = useIsland(PART);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") props.onClose();
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) props.onClose();
  };

  return createElement(
    "div",
    { id: props.id, className: "mk-settings", role: "group", onBlur, onKeyDown },
    createElement(Theme, {
      value: themePreference,
      onPick: (theme: ThemePreference) => client.setTheme(theme),
    }),
    createElement(Corners, {
      value: position,
      onPick: (corner: Corner) => client.setPosition(corner),
    }),
    createElement(Setting, {
      checked: !showResolved,
      copy: SETTINGS_COPY.hideResolved,
      onChange: (on: boolean) => client.setShowResolved(!on),
    }),
    createElement(Setting, {
      checked: island.developer,
      copy: SETTINGS_COPY.developer,
      onChange: island.setDeveloper,
    }),
    createElement(Dismiss, { onHide: () => client.setHidden(true) }),
  );
}

interface ThemeProps {
  readonly value: ThemePreference;
  readonly onPick: (theme: ThemePreference) => void;
}

/**
 * A segmented control, not a switch: three states cannot be a switch, and a
 * select for three short words hides two behind a click.
 */
function Theme(props: ThemeProps): ReactNode {
  const labelId = useId();
  const copy = SETTINGS_COPY.theme;

  return createElement(
    "div",
    { className: "mk-setting" },
    createElement(
      "span",
      null,
      createElement("span", { className: "mk-setting-name", id: labelId }, copy.name),
      createElement("span", { className: "mk-setting-hint" }, copy.hint),
    ),
    createElement(
      "span",
      { className: "mk-seg", role: "radiogroup", "aria-labelledby": labelId },
      ...THEME_PREFERENCES.map((theme) =>
        createElement(
          "button",
          {
            key: theme,
            type: "button",
            role: "radio",
            "aria-checked": theme === props.value,
            className: "mk-seg-one",
            title: THEME_TITLES[theme],
            onClick: () => props.onPick(theme),
          },
          THEME_LABELS[theme],
        ),
      ),
    ),
  );
}

interface CornersProps {
  readonly value: Corner;
  readonly onPick: (corner: Corner) => void;
}

/**
 * The four corners as four corners. A list of their names would read as four
 * options; a square reads as the screen it is about.
 */
function Corners(props: CornersProps): ReactNode {
  const labelId = useId();
  const copy = SETTINGS_COPY.position;

  return createElement(
    "div",
    { className: "mk-setting" },
    createElement(
      "span",
      null,
      createElement("span", { className: "mk-setting-name", id: labelId }, copy.name),
      createElement("span", { className: "mk-setting-hint" }, copy.hint),
    ),
    createElement(
      "span",
      { className: "mk-corners", role: "radiogroup", "aria-labelledby": labelId },
      ...CORNER_ORDER.map((corner) =>
        createElement("button", {
          key: corner,
          type: "button",
          role: "radio",
          "aria-checked": corner === props.value,
          "aria-label": CORNER_LABELS[corner],
          title: CORNER_LABELS[corner],
          className: "mk-corner",
          "data-mk-corner": corner,
          onClick: () => props.onPick(corner),
        }),
      ),
    ),
  );
}

interface DismissProps {
  readonly onHide: () => void;
}

/**
 * Hidden for the session, the way a dev indicator hides. A button and not a
 * switch: nothing here turns it back on — a comment arriving does.
 */
function Dismiss(props: DismissProps): ReactNode {
  const copy = SETTINGS_COPY.hidden;

  return createElement(
    "div",
    { className: "mk-setting" },
    createElement(
      "span",
      null,
      createElement("span", { className: "mk-setting-name" }, copy.name),
      createElement("span", { className: "mk-setting-hint" }, copy.hint),
    ),
    createElement(
      "button",
      { type: "button", className: "mk-more", onClick: props.onHide },
      ISLAND_COPY.hide,
    ),
  );
}

interface SettingProps {
  readonly checked: boolean;
  readonly copy: { readonly name: string; readonly hint: string };
  readonly onChange: (on: boolean) => void;
}

/** A name, the sentence under it, and a real switch on the right. */
function Setting(props: SettingProps): ReactNode {
  const labelId = useId();

  return createElement(
    "div",
    { className: "mk-setting" },
    createElement(
      "span",
      null,
      createElement("span", { className: "mk-setting-name", id: labelId }, props.copy.name),
      createElement("span", { className: "mk-setting-hint" }, props.copy.hint),
    ),
    createElement("button", {
      type: "button",
      role: "switch",
      "aria-checked": props.checked,
      "aria-labelledby": labelId,
      className: "mk-switch",
      onClick: () => props.onChange(!props.checked),
    }),
  );
}
