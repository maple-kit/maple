/**
 * Unsent comments, as markdown somebody can paste.
 *
 * It is the way out of a deployment with no store, and the way out of one
 * whose store is down: a reviewer who wrote five comments and cannot publish
 * them still has five comments, and this is how they leave the page. The
 * shape is the one `exportMarkdown` already writes, fence and all, because an
 * agent reading a pasted block should not have to learn a second format.
 */

import { exportMarkdown } from "./markdown.js";

import type { Draft } from "../overlay/drafts.js";
import type { Comment, CommentContext } from "../types.js";
import type { ExportOptions, MarkdownExport } from "./markdown.js";

/** How a set of drafts is written out. */
export interface DraftExportOptions extends Omit<ExportOptions, "approvals"> {
  /** What a reviewer calls this surface, where `branch` is not it. */
  readonly label?: string;
}

/** The context a draft written before the page was measured still needs. */
const UNKNOWN_CONTEXT: CommentContext = {
  url: "",
  viewportWidth: 0,
  viewportHeight: 0,
  contentWidth: 0,
  devicePixelRatio: 1,
  colorScheme: "light",
};

/**
 * Turns drafts into the same markdown a published set produces.
 *
 * The author is the one field a draft cannot have: nothing has asked the
 * route who this is, and guessing would put a name on something nobody
 * signed. So it is the guest author, which is what the route would assign.
 */
export function exportDrafts(
  drafts: readonly Draft[],
  options: DraftExportOptions,
): MarkdownExport {
  const ordered = [...drafts].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return exportMarkdown(
    ordered.map((draft) => asComment(draft, options)),
    options,
  );
}

function asComment(draft: Draft, options: DraftExportOptions): Comment {
  return {
    id: draft.id,
    branch: options.branch,
    ...(options.label === undefined ? {} : { label: options.label }),
    body: draft.body,
    status: "open",
    createdAt: draft.updatedAt,
    author: { id: "guest", name: "Guest", provenance: "guest" },
    anchor: draft.anchor,
    context: draft.context ?? UNKNOWN_CONTEXT,
    ...(draft.attachments === undefined ? {} : { attachments: draft.attachments }),
  };
}
