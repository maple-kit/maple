/**
 * The reviewer interface's state machine, with no interface attached.
 *
 * `@maple-kit/react` and any later Astro, Svelte or plain-JS binding are
 * subscriptions over what is exported here and nothing deeper. This entrypoint
 * is public surface, so everything on it is plain: Promises, structural types
 * and `Error` subclasses, never Effect.
 */

export {
  ASSIST_DEBOUNCE_MS,
  ASSIST_IDLE,
  ASSIST_MIN_LENGTH,
  createAssistRunner,
} from "./assist.js";
export type { AssistRunner, AssistRunnerOptions } from "./assist.js";
export { createMapleClient } from "./controller.js";
export type { ClientView, MapleClient, MapleClientOptions } from "./controller.js";
export { createDraftKeeper, DRAFT_DEBOUNCE_MS, DRAFT_LIFETIME_MS, draftIdFor } from "./drafts.js";
export type { DraftKeeper, DraftKeeperOptions } from "./drafts.js";
export { detailOf, failureFrom } from "./failure.js";
export type { FailedCall, FailureKind, MapleFailure } from "./failure.js";
export { matchesFilter, openCount, visibleComments } from "./filters.js";
export { startLink } from "./link.js";
export type { LinkOptions, LinkRun } from "./link.js";
export { createNavigationGuard, navigateOnPurpose } from "./navigation.js";
export type {
  LeaveAnswer,
  LeavePrompt,
  LeaveQuestion,
  LeaveReason,
  LeaveSubject,
  NavigationGuard,
  NavigationGuardOptions,
  NavigationView,
} from "./navigation.js";
export {
  MAPLE_DEFAULTS,
  nearestCorner,
  parseMapleQuery,
  readMapleConfig,
  readPreferences,
  resolveConfig,
  writePreferences,
} from "./preferences.js";
export type {
  ConfigInput,
  Frame,
  MapleConfig,
  MapleProps,
  MapleQuery,
  Point,
  PreferencesOptions,
  StoredPreferences,
} from "./preferences.js";
export {
  COMMENT_SHORTCUT,
  isEditable,
  MOCK_SHORTCUT,
  opensComposer,
  opensMock,
  watchEscape,
} from "./shortcut.js";
export type { EscapeOptions, ShortcutEvent } from "./shortcut.js";
export {
  BRIDGE_PARAM,
  capturePairing,
  forgetPairing,
  isBridgeAddress,
  isSoloToken,
  parsePairing,
  SOLO_HEADER,
  SOLO_PARAM,
  soloLink,
} from "./solo.js";
export type { CaptureOptions, Pairing } from "./solo.js";
export {
  hostScheme,
  overlaySchemeFor,
  readThemeSignals,
  relativeLuminance,
  themeFrom,
  watchTheme,
} from "./theme.js";
export type { ThemeSignals, ThemeView, ThemeWatch, ThemeWatchOptions } from "./theme.js";
export { DRAFT_EXPORT_VERSION, readDraftExport, writeDraftExport } from "./transfer.js";
export type {
  DraftExport,
  DraftExportRead,
  DraftExportRefusal,
  DraftImportOutcome,
  DraftImportPreview,
  DraftImportResult,
  ForeignDrafts,
} from "./transfer.js";
export { createTransport, DEFAULT_BASE_PATH, MapleRequestError } from "./transport.js";
export type { Identity, LinkAttempt, LinkStart, Transport, TransportOptions } from "./transport.js";
export { COMMENT_FILTERS, CORNERS, DETAILS, PICK_ORDER, THEME_PREFERENCES } from "./types.js";
export type {
  AssistConfig,
  AssistState,
  ClientState,
  CommentFilter,
  GitHubLink,
  ComposerState,
  ComposerTarget,
  Corner,
  Detail,
  IslandSize,
  PickKind,
  PickState,
  PostedComment,
  ResolutionClaim,
  Scheme,
  ThemePreference,
  ThemeSource,
  ThemeState,
} from "./types.js";
