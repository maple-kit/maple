/**
 * "Search all APIs" and "Search all flags", loaded when a reviewer opens one:
 * `mock.ts` imports this module dynamically, so a box that never searches
 * carries none of it and nothing is asked of the route before then.
 */

import { createElement, useEffect, useRef, useState } from "react";

import { button } from "./button.js";
import { callName, codecOf, MOCK_COPY, STATE_LABELS } from "./language.js";
import { flagRow } from "./layers.js";
import { Menu } from "./menu.js";

import type { MenuOption } from "./menu.js";
import type { MockState } from "@maple-kit/core/mock";
import type { CallHit, CallResults, MockClient, MockClientState } from "@maple-kit/mock/client";
import type { ReactElement, ReactNode, RefObject } from "react";

/** The words this chunk says. They load with it. */
const SEARCH_COPY = {
  apis: "Search APIs",
  flags: "Search flags",
  more: "Show more",
  none: "Nothing matches.",
  failed: "Couldn't search. Try again.",
  onlyThisPage: "No API schemas here. Searching what this page fetched.",
  add: "Add",
  remove: "Remove",
  added: "added",
  esc: "Esc",
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

/** The search field and what it found, in the place of the button that opened it. */
export function Search(props: SearchProps): ReactElement {
  const { client, kind, state } = props;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const section = useRef<HTMLElement>(null);
  useReturnFocus(section, kind);
  const found =
    kind === "calls"
      ? createElement(CallResults, { query, state, client, onBusy: setBusy })
      : createElement(FlagResults, { key: query, client, query });

  return createElement(
    "section",
    { ref: section, "aria-label": kind === "calls" ? MOCK_COPY.searchApis : MOCK_COPY.searchFlags },
    createElement(
      "div",
      { className: "mk-mock-head", "data-mk-thinking": String(busy), "aria-busy": busy },
      createElement("input", {
        className: "mk-mock-field",
        type: "text",
        placeholder: kind === "calls" ? SEARCH_COPY.apis : SEARCH_COPY.flags,
        "aria-label": kind === "calls" ? SEARCH_COPY.apis : SEARCH_COPY.flags,
        value: query,
        autoFocus: true,
        onChange: (event: { currentTarget: HTMLInputElement }) =>
          setQuery(event.currentTarget.value),
      }),
      createElement("kbd", { className: "mk-mock-key-hint" }, SEARCH_COPY.esc),
    ),
    found,
  );
}

/** Escape closes the search from its own field: focus goes back to the button that opened it. */
function useReturnFocus(section: RefObject<HTMLElement | null>, kind: string): void {
  useEffect(() => {
    const box = section.current?.closest(".mk-mock");
    return () => {
      setTimeout(() => box?.querySelector<HTMLElement>(`[data-mk-search="${kind}"]`)?.focus());
    };
  }, [section, kind]);
}

/** What a flag search found, a page at a time. Reads memory, so there is nothing to wait for. */
function FlagResults(props: { query: string; client: MockClient }): ReactElement {
  const { client, query } = props;
  const [shown, setShown] = useState(PAGE);
  const all = client.searchFlags(query);
  return list(
    all.slice(0, shown).map((flag) => flagRow(flag, client, flag.set !== undefined)),
    all.length > shown ? () => setShown(shown + PAGE) : undefined,
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
}): ReactElement {
  const { client, onBusy, query, state } = props;
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
      added ? createElement("span", { className: "mk-mock-codec" }, SEARCH_COPY.added) : null,
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
