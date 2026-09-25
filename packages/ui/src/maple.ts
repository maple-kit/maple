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
  MapleDetail,
  MapleScoreCard,
  MapleTarget,
} from "./composer/index.js";
import {
  Approve,
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
  Unsent,
} from "./island/index.js";
import { PICK_ORDER } from "./island/language.js";
import { MapleMarkLayer } from "./marks/index.js";
import { MapleMock } from "./mock/index.js";
import { MapleNotice } from "./notice/index.js";
import { MaplePicker } from "./picker/index.js";
import { MapleRoot } from "./root.js";

import type { LeaveAsk, MapleAttachmentsProps } from "./composer/index.js";
import type { MapleRootProps } from "./root.js";
import type { Comment } from "@maple-kit/core";
import type { FailedCall } from "@maple-kit/core/client";
import type { ReactElement } from "react";

/** The island answers for the calls it makes; the panel answers for the send. */
const LOAD_CALLS: readonly FailedCall[] = ["load", "status", "link"];
const SEND_CALLS: readonly FailedCall[] = ["send"];

/** Everything the root takes, plus the few choices the composition itself has. */
export interface MapleProps extends MapleRootProps {
  /** Start with the inventory open. Collapsed to its pill unless set. */
  readonly defaultOpen?: boolean;
  /** The bar naming the gesture while a pick is armed. On unless set false. */
  readonly hint?: boolean;
  /** Asked before a link takes the page away from an unsent comment. */
  readonly leave?: LeaveAsk;
  /**
   * Where images go and are read back from. Seams, not options: core has no
   * blob route, and without `resolve` a kept shot is a sentence about one.
   */
  readonly attachments?: Pick<MapleAttachmentsProps, "resolve" | "upload">;
}

/**
 * The whole reviewer interface: the marks on the page, the picker, the
 * inventory and the composer, over one shadow root and one controller, and the
 * mock box on a page where Maple Mock's transport is installed.
 */
export const Maple = /** @__PURE__ */ forwardRef<HTMLDivElement, MapleProps>(
  function Maple(props, ref) {
    const { attachments, children, defaultOpen, hint, leave, ...root } = props;

    return createElement(
      MapleRoot,
      { ...root, ref },
      createElement(MapleMarkLayer, { key: "marks" }),
      createElement(MaplePicker, { key: "picker", ...(hint === undefined ? {} : { hint }) }),
      inventory(root.branch, root.label, defaultOpen === true),
      composer(leave, attachments),
      createElement(MapleMock, { key: "mock" }),
      children,
    );
  },
);

/** The island, with every row the default composition shows. */
function inventory(branch: string, label: string | undefined, defaultOpen: boolean): ReactElement {
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
        createElement(Branch, { branch, ...(label === undefined ? {} : { label }) }),
        createElement(Settings),
      ),
      createElement(MapleNotice, { during: LOAD_CALLS }),
      createElement(Filters),
      createElement(List, { children: (comment: Comment) => createElement(Item, { comment }) }),
      createElement(Unsent),
      createElement(Approve),
      createElement(
        NewComment,
        null,
        ...PICK_ORDER.map((kind) => createElement(PickButton, { key: kind, kind })),
      ),
    ),
  );
}

/** The panel, in the order a comment is written: what, then words, then send. */
function composer(leave: LeaveAsk | undefined, shots: MapleProps["attachments"]): ReactElement {
  return createElement(
    MapleComposer,
    { key: "composer", ...(leave === undefined ? {} : { leave }) },
    createElement(MapleTarget, { key: "target" }),
    createElement(MapleBody, { key: "body" }),
    createElement(MapleDetail, { key: "detail" }),
    createElement(MapleScoreCard, { key: "score" }),
    createElement(MapleContextBadge, { key: "context" }),
    createElement(MapleAttachments, { key: "attachments", ...shots }),
    createElement(MapleNotice, { key: "notice", during: SEND_CALLS }),
    createElement(MapleActions, { key: "actions" }),
  );
}
