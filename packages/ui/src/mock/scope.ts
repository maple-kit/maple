/**
 * What `<Maple />` adds to the box: one client shared with the island's button.
 *
 * Its own module, so the box alone (`@maple-kit/ui/mock`) carries none of it.
 */

import { useMapleClient } from "@maple-kit/react";
import { useMock } from "@maple-kit/react/mock";
import { createContext, createElement, useContext, useEffect } from "react";

import { CodeIcon } from "../icons/code.js";
import { MapleMock } from "./mock.js";

import type { MockBinding } from "@maple-kit/react/mock";
import type { ReactElement, ReactNode } from "react";

const MockScope = /** @__PURE__ */ createContext<MockBinding | null>(null);
const LABEL = "Mock data";

/**
 * Mounts the box beside its children, sharing its client with the island's
 * button. `m` answers only while Maple is open: the card is up or a pick is
 * armed. Opening the box ends a pick, since the box takes the keyboard.
 */
export function MapleMockScope(props: { readonly children?: ReactNode }): ReactElement {
  const maple = useMapleClient();
  const binding = useMock({
    shortcutWhen: () => {
      const { islandOpen, pick } = maple.getState();
      return islandOpen || pick.armed;
    },
  });
  const { open } = binding.state;
  useEffect(() => {
    if (open && maple.getState().pick.armed) maple.disarm();
  }, [maple, open]);
  return createElement(
    MockScope.Provider,
    { value: binding },
    props.children,
    createElement(MapleMock, { client: binding.client }),
  );
}

/** The island's control for the box, drawn only where a transport is installed. */
export function MapleMockToggle(): ReactElement | null {
  const scope = useContext(MockScope);
  if (!scope?.state.installed) return null;
  const { client, state } = scope;
  return createElement(
    "button",
    {
      type: "button",
      className: "mk-iconbtn mk-hit",
      "aria-label": LABEL,
      "aria-expanded": state.open,
      "aria-keyshortcuts": "m",
      title: LABEL,
      onClick: () => client.setOpen(!state.open),
    },
    createElement(CodeIcon),
  );
}
