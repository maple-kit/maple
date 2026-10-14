/**
 * "Search all APIs" and "Search all flags", loaded when a reviewer opens one:
 * `mock.ts` imports this module dynamically, so a box that never searches
 * carries none of it and nothing is asked of the route before then.
 */

import { CALLS_QUERY_MAX } from "@maple-kit/mock/client";
import { createElement, useEffect, useRef, useState } from "react";

import { button, cancel, takeHeld } from "./button.js";
import { callName, codecOf, MOCK_COPY, STATE_LABELS } from "./language.js";
import { flagRow, LAYER_COPY } from "./layers.js";
import { Menu } from "./menu.js";

import type { MenuOption } from "./menu.js";
import type { MockState } from "@maple-kit/core/mock";
import type {
  CallHit,
  CallResults,
  MockClient,
  MockClientState,
  MockFlagRow,
} from "@maple-kit/mock/client";
import type { ReactElement, ReactNode } from "react";

/** The words this chunk says. They load with it. */
const SEARCH_COPY = {
  more: "Show more",
  none: "Nothing matches.",
  failed: "Couldn't search. Try again.",
  onlyThisPage: "No API schemas here. Searching what this page fetched.",
  add: "Add",
  remove: "Remove",
  elsewhere: "another route",
  described: "OpenAPI",
} as const;

/** How long typing pauses before a search is made. */
const SEARCH_DEBOUNCE_MS = 250;

/** Results shown at a time, and what "Show more" adds. */
const PAGE = 20;

interface SearchProps {
  readonly kind: "calls" | "flags";
  readonly state: MockClientState;
  readonly client: MockClient;
}

/** The title row as a search field with Cancel, and what it found in place of the section's list. */
export function Search(props: SearchProps): ReactElement {
  const { client, kind, state } = props;
  const [query, setQuery] = useState(takeHeld);
  const [busy, setBusy] = useState(false);
  const section = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const label = kind === "calls" ? MOCK_COPY.apisField : MOCK_COPY.flagsField;
  const toField = () => {
    const active = (section.current?.getRootNode() as ShadowRoot | undefined)?.activeElement;
    if (!active || active.textContent === SEARCH_COPY.more) field.current?.focus();
  };
  const found =
    kind === "calls"
      ? createElement(CallResults, { query, state, client, onBusy: setBusy, toField })
      : createElement(FlagResults, { key: query, client, query, state, toField });

  return createElement(
    "section",
    { ref: section, "aria-label": label },
    createElement(
      "div",
      { className: "mk-mock-titlerow", "data-mk-thinking": String(busy), "aria-busy": busy },
      createElement("input", {
        className: "mk-mock-field",
        type: "text",
        placeholder: label,
        "aria-label": label,
        value: query,
        ref: field,
        maxLength: CALLS_QUERY_MAX,
        autoFocus: true,
        onChange: (event: { currentTarget: HTMLInputElement }) =>
          setQuery(event.currentTarget.value),
      }),
      cancel(client),
    ),
    found,
  );
}

/** What a flag search found, a page at a time. Reads memory, so there is nothing to wait for. */
function FlagResults(props: {
  query: string;
  state: MockClientState;
  client: MockClient;
  toField: () => void;
}): ReactElement {
  const { client, query, state, toField } = props;
  const [shown, setShown] = useState(PAGE);
  const all = client.searchFlags(query);
  const here = new Set(state.flags.filter((flag) => flag.seen).map((flag) => flag.key));
  const mark = (flag: MockFlagRow) => {
    if (flag.set !== undefined) return MOCK_COPY.added;
    return here.has(flag.key) ? undefined : LAYER_COPY.notHere;
  };
  return list(
    all.slice(0, shown).map((flag) => flagRow(flag, client, mark(flag))),
    all.length > shown
      ? () => {
          setShown(shown + PAGE);
          if (all.length <= shown + PAGE) toField();
        }
      : undefined,
    all.length === 0,
  );
}

interface Loaded {
  readonly hits: readonly CallHit[];
  readonly next: string | undefined;
  readonly schemas: boolean;
  readonly failed: boolean;
}

const NOTHING: Loaded = { hits: [], next: undefined, schemas: true, failed: false };

/** What a call search found: the first page as typing pauses, more on request. */
function CallResults(props: {
  query: string;
  state: MockClientState;
  client: MockClient;
  onBusy: (busy: boolean) => void;
  toField: () => void;
}): ReactElement {
  const { client, onBusy, query, state, toField } = props;
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const flight = new AbortController();
    const timer = setTimeout(
      () => {
        onBusy(true);
        client.searchCalls(query, undefined, flight.signal).then(
          (page) => !flight.signal.aborted && settle(page, []),
          () => !flight.signal.aborted && fail(),
        );
      },
      asked ? SEARCH_DEBOUNCE_MS : 0,
    );
    const settle = (page: CallResults, before: readonly CallHit[]) => {
      onBusy(false);
      setAsked(true);
      setLoaded({
        hits: [...before, ...page.hits],
        next: page.next,
        schemas: page.schemas,
        failed: false,
      });
    };
    const fail = () => {
      onBusy(false);
      setAsked(true);
      setLoaded({ ...NOTHING, failed: true });
    };
    return () => {
      clearTimeout(timer);
      flight.abort();
    };
    // `asked` only decides the first wait; a query change is what searches again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, query]);

  const more = () => {
    onBusy(true);
    client.searchCalls(query, loaded.next).then(
      (page) => {
        onBusy(false);
        setLoaded({ ...loaded, hits: [...loaded.hits, ...page.hits], next: page.next });
        // The button that had focus is gone; Escape only works from inside the box.
        if (page.next === undefined) toField();
      },
      () => {
        onBusy(false);
        setLoaded({ ...loaded, failed: true });
      },
    );
  };

  return createElement(
    "div",
    null,
    loaded.schemas
      ? null
      : createElement("p", { className: "mk-mock-unnamed" }, SEARCH_COPY.onlyThisPage),
    loaded.failed ? createElement("p", { className: "mk-mock-unnamed" }, SEARCH_COPY.failed) : null,
    list(
      loaded.hits.map((hit) => callRow(hit, state, client)),
      loaded.next === undefined ? undefined : more,
      asked && loaded.hits.length === 0 && !loaded.failed,
    ),
  );
}

function list(rows: ReactNode[], more: (() => void) | undefined, empty: boolean): ReactElement {
  return createElement(
    "div",
    null,
    empty
      ? createElement("p", { className: "mk-mock-empty" }, SEARCH_COPY.none)
      : createElement("ul", { className: "mk-mock-calls" }, rows),
    more === undefined ? null : button(SEARCH_COPY.more, more, { quiet: true }),
  );
}

/** A found call, with the same state pick a listed one has; picking one adds it to the draft. */
function callRow(hit: CallHit, state: MockClientState, client: MockClient): ReactElement {
  const chosen = state.draft.find((call) => call.key === hit.key)?.state;
  const added = chosen !== undefined;
  const here = state.calls.some((call) => call.key === hit.key && call.seen);
  const mark = added ? MOCK_COPY.added : hint(here, hit.seen);
  const options: readonly MenuOption[] = [
    { value: undefined, label: added ? SEARCH_COPY.remove : SEARCH_COPY.add },
    ...Object.entries(STATE_LABELS).map(([value, label]) => ({ value, label })),
  ];
  return createElement(
    "li",
    {
      key: hit.key,
      className: "mk-mock-call",
      "data-mk-mocked": String(added),
      "data-mk-seen": String(hit.seen),
      title: hit.key,
    },
    createElement(
      "span",
      { className: "mk-mock-name mk-mono" },
      createElement("span", { className: "mk-mock-codec" }, codecOf(hit.key)),
      callName(hit.key),
      mark === undefined ? null : createElement("span", { className: "mk-mock-codec" }, mark),
    ),
    createElement(Menu, {
      label: callName(hit.key),
      options,
      value: chosen,
      onPick: (next) => client.choose(hit.key, next as MockState | undefined),
    }),
    hit.summary === undefined
      ? null
      : createElement("span", { className: "mk-mock-sum" }, hit.summary),
  );
}

/** Where a found call comes from, when it is not this page's. */
function hint(here: boolean, seen: boolean): string | undefined {
  if (here) return undefined;
  return seen ? SEARCH_COPY.elsewhere : SEARCH_COPY.described;
}
