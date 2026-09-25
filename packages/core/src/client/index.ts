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
export { createNavigationGuard } from "./navigation.js";
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
  hostScheme,
  overlaySchemeFor,
  readThemeSignals,
  relativeLuminance,
  themeFrom,
  watchTheme,
} from "./theme.js";
export type { ThemeSignals, ThemeView, ThemeWatch, ThemeWatchOptions } from "./theme.js";
export { createTransport, DEFAULT_BASE_PATH, MapleRequestError } from "./transport.js";
export type { Identity, LinkAttempt, LinkStart, Transport, TransportOptions } from "./transport.js";
export { COMMENT_FILTERS, CORNERS, DETAILS, THEME_PREFERENCES } from "./types.js";
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
  PickKind,
  PickState,
  PostedComment,
  ResolutionClaim,
  Scheme,
  ThemePreference,
  ThemeSource,
  ThemeState,
} from "./types.js";
