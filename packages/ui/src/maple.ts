/**
 * `<Maple>`: every part, assembled, for an application that wants the default.
 *
 * Most applications replace no part, and asking those to write a forty-line
 * tree before one comment can be left is how a tool gets called flexible and
 * never installed. Its own subpath, not a root export: importing this is the
 * decision to take every part.
 */

import { createElement, forwardRef } from "react";

import {
  MapleActions,
  MapleAttachments,
  MapleBody,
  MapleComposer,
  MapleContextBadge,
  MapleTarget,
} from "./composer/index.js";
import {
  Branch,
  Filters,
  Header,
  Island,
  IslandContent,
  IslandTrigger,
  Item,
  List,
  Logo,
  NewComment,
  PickButton,
  Settings,
} from "./island/index.js";
import { PICK_ORDER } from "./island/language.js";
import { MapleMarkLayer } from "./marks/index.js";
import { MaplePicker } from "./picker/index.js";
import { MapleRoot } from "./root.js";

import type { LeaveAsk } from "./composer/index.js";
import type { MapleRootProps } from "./root.js";
import type { Comment } from "@maple-kit/core";
import type { ReactElement } from "react";

/** Everything the root takes, plus the few choices the composition itself has. */
export interface MapleProps extends MapleRootProps {
  /** Start with the inventory open. Collapsed to its pill unless set. */
  readonly defaultOpen?: boolean;
  /** The bar naming the gesture while a pick is armed. On unless set false. */
  readonly hint?: boolean;
  /** Asked before a link takes the page away from an unsent comment. */
  readonly leave?: LeaveAsk;
}

/**
 * The whole reviewer interface: the marks on the page, the picker, the
 * inventory and the composer, over one shadow root and one controller.
 */
export const Maple = /** @__PURE__ */ forwardRef<HTMLDivElement, MapleProps>(
  function Maple(props, ref) {
    const { children, defaultOpen, hint, leave, ...root } = props;

    return createElement(
      MapleRoot,
      { ...root, ref },
      createElement(MapleMarkLayer, { key: "marks" }),
      createElement(MaplePicker, { key: "picker", ...(hint === undefined ? {} : { hint }) }),
      inventory(root.branch, defaultOpen === true),
      composer(leave),
      children,
    );
  },
);

/** The island, with every row the default composition shows. */
function inventory(branch: string, defaultOpen: boolean): ReactElement {
  return createElement(
    Island,
    { defaultOpen, key: "island" },
    createElement(IslandTrigger),
    createElement(
      IslandContent,
      null,
      createElement(
        Header,
        null,
        createElement(Logo),
        createElement(Branch, { branch }),
        createElement(Settings),
      ),
      createElement(Filters),
      createElement(List, { children: (comment: Comment) => createElement(Item, { comment }) }),
      createElement(
        NewComment,
        null,
        ...PICK_ORDER.map((kind) => createElement(PickButton, { key: kind, kind })),
      ),
    ),
  );
}

/** The panel, in the order a comment is written: what, then words, then send. */
function composer(leave: LeaveAsk | undefined): ReactElement {
  return createElement(
    MapleComposer,
    { key: "composer", ...(leave === undefined ? {} : { leave }) },
    createElement(MapleTarget, { key: "target" }),
    createElement(MapleBody, { key: "body" }),
    createElement(MapleContextBadge, { key: "context" }),
    createElement(MapleAttachments, { key: "attachments" }),
    createElement(MapleActions, { key: "actions" }),
  );
}
