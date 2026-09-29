/**
 * The box's flags and identity, loaded on demand: `mock.ts` imports this
 * module dynamically, and only on a page that evaluated a flag or whose route
 * declares identity rules, so every other page's box stays within its budget.
 */

import { describeIdentity } from "@maple-kit/core/mock";
import { createElement, useEffect, useRef, useState } from "react";

import { ChevronIcon } from "../icons/chevron.js";

import type { FlagValue } from "@maple-kit/core/mock";
import type { MockClient, MockClientState, MockFlagRow } from "@maple-kit/mock/client";
import type { ReactElement, ReactNode, RefObject } from "react";

/** The words this chunk says. They load with it. */
export const LAYER_COPY = {
  shownAs: "Shown as",
  role: "Role",
  granted: "Granted",
  takenAway: "Taken away",
  flags: "Flags",
  permissions: "Permissions",
  on: "On",
  off: "Off",
  realValue: "Real value",
  notEvaluated: "Named by the mock, not evaluated on this page",
  serverActs: "The server still acts as you.",
  reloads: "reloads the page",
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
  const grants: Folded[] = [];
  const real = state.realAs;
  const roles = identity?.role?.values ?? [];
  const reloading = identity?.server !== undefined;
  const titled = (title: string) => (reloading ? `${title} · ${LAYER_COPY.reloads}` : title);
  if (roles.length > 0) {
    const role = state.draftAs?.role;
    rows.push(
      row(
        { key: "role", name: LAYER_COPY.role, set: role !== undefined, prose: true },
        choices(LAYER_COPY.role, roles, { set: role, real: real?.role }, (next) =>
          client.setRole(next),
        ),
      ),
    );
  }
  for (const name of identity?.permissions?.values ?? []) {
    const granted = state.draftAs?.permissions?.[name];
    const pick = (next: string | undefined) =>
      client.setPermission(name, next === undefined ? undefined : next === LAYER_COPY.granted);
    const current = granted === undefined ? undefined : grantedLabel(granted);
    const held = real === undefined ? undefined : grantedLabel(real.permissions.includes(name));
    grants.push({
      set: current !== undefined,
      node: row(
        { key: `p:${name}`, name, set: current !== undefined },
        choices(
          name,
          [LAYER_COPY.granted, LAYER_COPY.takenAway],
          { set: current, real: held },
          pick,
        ),
      ),
    });
  }
  const flags = state.flags.map((flag) => ({
    set: flag.set !== undefined,
    node: flagRow(flag, client),
  }));
  return createElement(
    "div",
    { className: "mk-mock-layers", ref: panel },
    rows.length === 0 ? null : section(titled(LAYER_COPY.shownAs), rows),
    grants.length === 0
      ? null
      : createElement(Fold, { title: titled(LAYER_COPY.permissions), rows: grants }),
    flags.length === 0 ? null : createElement(Fold, { title: LAYER_COPY.flags, rows: flags }),
  );
}

interface Folded {
  readonly set: boolean;
  readonly node: ReactNode;
}

/**
 * A list that can run to hundreds, folded to its count. Folded, it still
 * shows every row the draft overrides, so nothing set is ever out of sight.
 */
function Fold(props: { readonly title: string; readonly rows: readonly Folded[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const { rows, title } = props;
  const shown = open ? rows : rows.filter((folded) => folded.set);
  return createElement(
    "section",
    { "aria-label": title },
    createElement(
      "button",
      {
        type: "button",
        className: "mk-mock-route mk-mock-fold",
        "aria-expanded": open,
        onClick: () => setOpen(!open),
      },
      `${title} · ${String(rows.length)}`,
      createElement(ChevronIcon, { size: 11 }),
    ),
    shown.length === 0
      ? null
      : createElement(
          "ul",
          { className: "mk-mock-calls" },
          shown.map((folded) => folded.node),
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

function flagRow(flag: MockFlagRow, client: MockClient): ReactNode {
  const pick = (next: FlagValue | undefined) => client.setFlag(flag.key, next);
  const values: readonly FlagValue[] =
    flag.type === "boolean" ? [true, false] : (flag.variants ?? []);
  const title = flag.seen
    ? `${LAYER_COPY.realValue}: ${JSON.stringify(flag.value)}`
    : `${flag.key}: ${LAYER_COPY.notEvaluated}`;
  const labels = values.map(valueLabel);
  const current = flag.set === undefined ? undefined : valueLabel(flag.set);
  const real = flag.seen && flag.value !== undefined ? valueLabel(flag.value) : undefined;
  const control =
    values.length === 0
      ? createElement(
          "span",
          { className: "mk-mock-rung" },
          current ?? valueLabel(flag.value ?? null),
        )
      : choices(flag.key, labels, { set: current, real }, (label) =>
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

/** What a row is set to, and what it really is: the second carries the dot. */
interface Choice {
  readonly set: string | undefined;
  readonly real: string | undefined;
}

/**
 * A radio group showing what the page will see: the draft's choice, else the
 * real value. Choosing the real one, or the chosen one again, puts it back.
 */
function choices(
  label: string,
  options: readonly string[],
  choice: Choice,
  pick: (next: string | undefined) => void,
): ReactElement {
  const shown = choice.set ?? choice.real;
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
          "aria-checked": option === shown,
          onClick: () => pick(option === choice.set || option === choice.real ? undefined : option),
        },
        option === choice.real
          ? createElement("span", { className: "mk-mock-dot", "aria-hidden": true })
          : null,
        option,
      ),
    ),
  );
}
