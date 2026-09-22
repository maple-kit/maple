/**
 * Turning comments into something a person and an agent both read.
 *
 * The fence is visible on purpose: the action that hands a pull-request body
 * to an agent strips HTML comments before the model sees them.
 */

export { exportDrafts } from "./drafts.js";
export type { DraftExportOptions } from "./drafts.js";
export {
  exportMarkdown,
  FENCE_BUDGET,
  FENCE_VERSION,
  parseFence,
  UnsupportedFenceError,
} from "./markdown.js";

export type { ExportOptions, MarkdownExport, ParsedFence, Reduction } from "./markdown.js";
