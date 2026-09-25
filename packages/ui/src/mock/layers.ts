/**
 * The box's flags and identity, loaded on demand: `mock.ts` imports this
 * module dynamically, and only on a page that evaluated a flag or whose route
 * declares identity rules, so every other page's box stays within its budget.
 */

import { describeIdentity } from "@maple-kit/core/mock";
import { createElement, useEffect, useRef } from "react";

import type { FlagValue, MockSuggestion } from "@maple-kit/core/mock";
import type { MockClient, MockClientState, MockFlagRow } from "@maple-kit/mock/client";
import type { ReactElement, ReactNode, RefObject } from "react";

/** The words this chunk says. They load with it. */
export const LAYER_COPY = {
  shownAs: "Shown as",
  role: "Role",
  granted: "Granted",
  takenAway: "Taken away",
  flags: "Flags",
  on: "On",
  off: "Off",
  realValue: "Real value",
  notEvaluated: "Named by the mock, not evaluated on this page",
  serverActs: "The server still acts as you.",
} as const;

interface LayerProps {
  readonly state: MockClientState;
  readonly client: MockClient;
}

/** The role, the permissions and the flags, under the calls. */
export function Layers(props: LayerProps): ReactElement {
  const { client, state } = props;
  const { identity } = state;
  const panel = useRef<HTMLDivElement>(null);
  useShowTaken(panel, state.request);
  const rows: ReactNode[] = [];
  const roles = identity?.role?.values ?? [];
  if (roles.length > 0) {
    const role = state.draftAs?.role;
    rows.push(
      row(
        { key: "role", name: LAYER_COPY.role, set: role !== undefined, prose: true },
        choices(LAYER_COPY.role, roles, role, (next) => client.setRole(next)),
      ),
    );
  }
  for (const name of identity?.permissions?.values ?? []) {
    const granted = state.draftAs?.permissions?.[name];
    const pick = (next: string | undefined) =>
      client.setPermission(name, next === undefined ? undefined : next === LAYER_COPY.granted);
    const current = granted === undefined ? undefined : grantedLabel(granted);
    rows.push(
      row(
        { key: `p:${name}`, name, set: current !== undefined },
        choices(name, [LAYER_COPY.granted, LAYER_COPY.takenAway], current, pick),
      ),
    );
  }
  return createElement(
    "div",
    { className: "mk-mock-layers", ref: panel },
    rows.length === 0 ? null : section(LAYER_COPY.shownAs, rows),
    state.flags.length === 0
      ? null
      : section(
          LAYER_COPY.flags,
          state.flags.map((flag) => flagRow(flag, client)),
        ),
  );
}

/** A chip, taken, scrolls the last row it set here into view: those rows are its answer. */
function useShowTaken(ref: RefObject<HTMLElement | null>, request: string | undefined): void {
  useEffect(() => {
    const panel = ref.current;
    if (request === undefined || panel === null) return;
    const set = panel.querySelectorAll('[data-mk-mocked="true"]');
    const still = panel.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)");
    set[set.length - 1]?.scrollIntoView({
      block: "nearest",
      behavior: still?.matches ? "instant" : "smooth",
    });
  }, [ref, request]);
}

/** What the banner adds while a mock tells the page something about who or what. */
export function LayerBanner(props: { readonly state: MockClientState }): ReactNode {
  const { active, writes } = props.state;
  const who = describeIdentity(active?.as);
  const flags = Object.keys(active?.flags ?? {}).length;
  const said = [
    who === undefined ? "" : `Showing as ${who}. ${LAYER_COPY.serverActs}`,
    flags === 0 ? "" : `${plural(flags, "flag")} set.`,
    who === undefined || writes === 0
      ? ""
      : `${plural(writes, "write")} reached the server as you.`,
  ].filter(Boolean);
  return said.length === 0
    ? null
    : createElement("span", { className: "mk-mock-banner-as" }, said.join(" "));
}

/** A chip's flags and role, in the chip's own words: `new-roaster Off · as barista`. */
export function layerLabel(suggestion: MockSuggestion): string {
  const flags = Object.entries(suggestion.flags ?? {}).map(
    ([key, value]) => `${key} ${valueLabel(value)}`,
  );
  const role = suggestion.as?.role;
  return [...flags, ...(role === undefined ? [] : [`as ${role}`])].join(" · ");
}

function flagRow(flag: MockFlagRow, client: MockClient): ReactNode {
  const pick = (next: FlagValue | undefined) => client.setFlag(flag.key, next);
  const values: readonly FlagValue[] =
    flag.type === "boolean" ? [true, false] : (flag.variants ?? []);
  const title = flag.seen
    ? `${LAYER_COPY.realValue}: ${JSON.stringify(flag.value)}`
    : `${flag.key}: ${LAYER_COPY.notEvaluated}`;
  const labels = values.map(valueLabel);
  const current = flag.set === undefined ? undefined : valueLabel(flag.set);
  const control =
    values.length === 0
      ? createElement(
          "span",
          { className: "mk-mock-rung" },
          current ?? valueLabel(flag.value ?? null),
        )
      : choices(flag.key, labels, current, (label) =>
          pick(values[labels.indexOf(label ?? "")] ?? undefined),
        );
  return row({ key: `f:${flag.key}`, name: flag.key, set: current !== undefined, title }, control);
}

function valueLabel(value: FlagValue): string {
  if (value === true) return LAYER_COPY.on;
  if (value === false) return LAYER_COPY.off;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function grantedLabel(granted: boolean): string {
  return granted ? LAYER_COPY.granted : LAYER_COPY.takenAway;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

function section(title: string, rows: ReactNode[]): ReactElement {
  return createElement(
    "section",
    { key: title, "aria-label": title },
    createElement("p", { className: "mk-mock-route" }, title),
    createElement("ul", { className: "mk-mock-calls" }, rows),
  );
}

interface RowLabel {
  readonly key: string;
  readonly name: string;
  /** Whether the draft sets this row, which is what lights its label. */
  readonly set: boolean;
  /** A word rather than a code name, so it stays out of the monospace. */
  readonly prose?: boolean;
  readonly title?: string;
}

function row(label: RowLabel, control: ReactNode): ReactElement {
  const { key, name, prose, set, title } = label;
  return createElement(
    "li",
    { key, className: "mk-mock-call", "data-mk-mocked": String(set), title: title ?? name },
    createElement("span", { className: prose ? "mk-mock-name" : "mk-mock-name mk-mono" }, name),
    control,
  );
}

/** A radio group where choosing the chosen option puts it back to real. */
function choices(
  label: string,
  options: readonly string[],
  current: string | undefined,
  pick: (next: string | undefined) => void,
): ReactElement {
  return createElement(
    "div",
    { className: "mk-mock-states", role: "radiogroup", "aria-label": label },
    options.map((option) =>
      createElement(
        "button",
        {
          key: option,
          type: "button",
          role: "radio",
          className: "mk-mock-state mk-press",
          "aria-checked": option === current,
          onClick: () => pick(option === current ? undefined : option),
        },
        option,
      ),
    ),
  );
}
