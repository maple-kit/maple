/**
 * `Maple.Actions`: keep it, or publish it. Nothing here throws a draft away.
 *
 * A comment is a draft until it is published, so the quiet control is the
 * usual one: **Keep** closes the composer and leaves the comment unsent, on
 * the list with everything else waiting. **Publish** is the deliberate act
 * that puts it in the store. Both are disabled on a blank body.
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

/** Closes the composer and keeps what was written, unsent. */
export const KEEP_LABEL = "Keep";

/** The verb, because publishing is the act and the comment already exists. */
export const PUBLISH_LABEL = "Publish";

/** What a comment already written offers instead: done with it, or not yet. */
export const VIEW_LABELS = {
  close: "Close",
  resolve: "Resolve",
  reopen: "Reopen",
} as const;

/** The two controls, and room beside them for a later one. */
export const MapleActions = /** @__PURE__ */ forwardRef<HTMLElement, MapleActionsProps>(
  function MapleActions(props, ref) {
    const { composer, publishing } = useMaple();
    const client = useMapleClient();
    const scope = useComposerScope("Maple.Actions");
    const Element = (props.asChild ? Slot : "footer") as "footer";

    const publish = (): void => {
      void client.publish().then(
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
          disabled: composer.body.trim() === "",
          onClick: () => client.keepDraft(),
        },
        KEEP_LABEL,
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "mk-btn mk-btn-primary mk-press",
          disabled: composer.body.trim() === "" || publishing,
          onClick: publish,
        },
        PUBLISH_LABEL,
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
