/**
 * Design-system lint for Maple. This entrypoint is the rendered tier: the
 * rules that need a browser to have laid the page out before they can judge it.
 *
 * The static and judged tiers of the tracking issue land beside it and report
 * the same `Finding`.
 */

export {
  colorKey,
  contrastRatio,
  isUnreadableColor,
  over,
  parseColor,
  relativeLuminance,
} from "./color.js";
export type { Rgb } from "./color.js";
export {
  commentsForRun,
  findingComment,
  findingCommentId,
  findingComments,
  LINT_AUTHOR,
} from "./comment.js";
export type { FindingCommentOptions, RunCommentOptions } from "./comment.js";
export { NAMED_COLORS } from "./named-colors.js";
export { DEFAULT_VIEWPORTS, dedupe, lintRendered } from "./rendered/audit.js";
export type { Pass, RenderedLintOptions, RenderedRun, Seen, Viewport } from "./rendered/audit.js";
export { readPage } from "./rendered/collect.js";
export type { Reading, StyleRecord } from "./rendered/collect.js";
export {
  MIN_TOUCH_TARGET,
  MOTION_SAFE,
  RENDERED_RULES,
  renderedFindings,
  unreadableColors,
} from "./rendered/rules.js";
export type { RuleDefinition } from "./rendered/rules.js";
export { annotationsFor, DESIGN_LINT_CHECK, publishCheckRun } from "./report/check-run.js";
export type { Annotation, CheckRunTarget } from "./report/check-run.js";
export { describePlace, placeOf } from "./report/place.js";
export type { Place } from "./report/place.js";
export { toSarif } from "./report/sarif.js";
export type { SarifLog, SarifOptions } from "./report/sarif.js";
export { groupByRule, unreachableVerdict, verdictFor } from "./report/verdict.js";
export type { Conclusion, Verdict } from "./report/verdict.js";
export { lengthToPx, parseTokens, readTokenFiles, ROOT_FONT_SIZE } from "./tokens.js";
export type { TokenSet } from "./tokens.js";
export type { Finding, Severity, Tier } from "./types.js";
