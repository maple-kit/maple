/**
 * `Maple.Actions`: send, or leave it. Nothing here throws a draft away.
 *
 * Cancel closes the composer and the unsent comment stays where it was; only a
 * send clears one. Send is disabled while the body is blank and while a send
 * is in flight, so a double click cannot post twice.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { Slot } from "../slot.js";
import { useComposerScope } from "./scope.js";

import type { AsChildProps } from "../slot.js";
import type { ReactNode } from "react";

/** The footer. `children` lead it: that is where developer detail lands. */
export interface MapleActionsProps extends AsChildProps {
  readonly className?: string;
  readonly children?: ReactNode;
}

/** Leaves the draft where it is. */
export const CANCEL_LABEL = "Cancel";

/** The noun: it is what the reviewer is making. */
export const SEND_LABEL = "Comment";

/** What a comment already written offers instead: done with it, or not yet. */
export const VIEW_LABELS = {
  close: "Close",
  resolve: "Resolve",
  reopen: "Reopen",
} as const;

/** The two controls, and room beside them for a later one. */
export const MapleActions = /** @__PURE__ */ forwardRef<HTMLElement, MapleActionsProps>(
  function MapleActions(props, ref) {
    const { composer } = useMaple();
    const client = useMapleClient();
    const scope = useComposerScope("Maple.Actions");
    const Element = (props.asChild ? Slot : "footer") as "footer";

    const send = (): void => {
      void client.send().then(
        () => scope.clear(),
        () => undefined,
      );
    };

    const className = props.className ? `mk-composer-foot ${props.className}` : "mk-composer-foot";

    if (composer.viewing !== undefined) {
      return createElement(
        Element,
        { ref, className },
        props.children,
        createElement("span", { className: "mk-composer-fill" }),
        ...reading(composer.viewing, client),
      );
    }

    return createElement(
      Element,
      {
        ref,
        className,
      },
      props.children,
      createElement("span", { className: "mk-composer-fill" }),
      createElement(
        "button",
        {
          type: "button",
          className: "mk-btn mk-btn-quiet mk-press",
          onClick: () => client.closeComposer(),
        },
        CANCEL_LABEL,
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "mk-btn mk-btn-primary mk-press",
          disabled: composer.body.trim() === "" || composer.sending,
          onClick: send,
        },
        SEND_LABEL,
      ),
    );
  },
);

/**
 * A comment already written: close it, or change where it is in its life.
 * Nothing here edits the body — one body per comment, decided in docs/replies.
 */
function reading(id: string, client: ReturnType<typeof useMapleClient>): readonly ReactNode[] {
  const status = client.getState().comments.find((one) => one.id === id)?.status;
  const done = status === "resolved";

  return [
    createElement(
      "button",
      {
        key: "close",
        type: "button",
        className: "mk-btn mk-btn-quiet mk-press",
        onClick: () => client.closeComposer(),
      },
      VIEW_LABELS.close,
    ),
    status === "orphaned" ? null : moveOn(id, done, client),
  ];
}

/** The one status change a reviewer makes by hand, in either direction. */
function moveOn(id: string, done: boolean, client: ReturnType<typeof useMapleClient>): ReactNode {
  return createElement(
    "button",
    {
      key: "status",
      type: "button",
      className: "mk-btn mk-btn-primary mk-press",
      onClick: () => void client.setStatus(id, done ? "open" : "resolved"),
    },
    done ? VIEW_LABELS.reopen : VIEW_LABELS.resolve,
  );
}
