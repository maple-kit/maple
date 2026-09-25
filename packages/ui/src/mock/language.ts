/**
 * Every word the mock box and its banner say, in one module.
 *
 * The states are the recipe's closed set, in the order core lists them, and
 * each label is one word: a row carries nine of them beside a call's name.
 */

import type { MockState, ShapeSource } from "@maple-kit/core/mock";

/** What each state is called on its button. */
export const STATE_LABELS: Readonly<Record<MockState, string>> = {
  empty: "Empty",
  error: "Error",
  forbidden: "Forbidden",
  loading: "Loading",
  one: "One",
  many: "Many",
  long: "Long",
  sparse: "Sparse",
  mixed: "Mixed",
};

/** What the banner says a call now does, in a state's own grammar. */
export const STATE_SENTENCES: Readonly<Record<MockState, string>> = {
  empty: "is empty",
  error: "fails",
  forbidden: "is forbidden",
  loading: "never answers",
  one: "has one item",
  many: "has many items",
  long: "has long text",
  sparse: "has fields missing",
  mixed: "has a mix of items",
};

/** Where a call's shape came from, as the row's tag says it. */
export const SHAPE_LABELS: Readonly<Record<ShapeSource, string>> = {
  supplied: "OpenAPI",
  router: "Router types",
  validator: "Validator",
  introspection: "Introspection",
  sample: "Recorded",
};

/** The box's fixed words. */
export const MOCK_COPY = {
  label: "Mock this page",
  field: "Find a call",
  sentence: "Say a state, like “no items yet”",
  unnamed: "That doesn't name a state this page's data can be in.",
  or: "or",
  escape: "Esc",
  routePrefix: "Calls on",
  nothingRecorded: "Nothing recorded on this page yet. Use the page, then open this again.",
  nothingMatches: "No recorded call matches that.",
  notSeen: "Named by the mock, not recorded on this page",
  shapeFrom: "Shape from",
  copyLink: "Copy link",
  copyRecipe: "Copy recipe",
  copied: "Copied",
  copyFailed: "Could not copy",
  apply: "Apply and reload",
  turnOff: "Turn off",
  edit: "Edit",
} as const;

/** A chip's words: the state, and how many calls it would put in it. */
export function suggestionLabel(state: MockState, calls: number): string {
  return `${STATE_LABELS[state]} · ${String(calls)} ${calls === 1 ? "call" : "calls"}`;
}

/** The banner's sentence, which names the first call and counts the rest. */
export function bannerSentence(calls: readonly { key: string; state: MockState }[]): string {
  const [first, ...rest] = calls;
  if (first === undefined) return "Mock on";
  const more = rest.length === 0 ? "" : ` and ${String(rest.length)} more`;
  return `Mock on: ${callName(first.key)} ${STATE_SENTENCES[first.state]}${more}`;
}

/** A key without its codec prefix, which the row shows on its own. */
export function callName(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? key : key.slice(colon + 1);
}

/** The codec a key belongs to: `rest`, `trpc`. */
export function codecOf(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? "" : key.slice(0, colon);
}
