/**
 * `MapleMock`, or `Maple.Mock` inside `<Maple />`: the box and its banner.
 *
 * On its own it mounts a shadow host of its own and adopts `MOCK_CSS`; inside a
 * `Maple.Root` it renders into that root, whose sheet already carries the box's
 * rules. It draws nothing on a page where no transport is installed, and every
 * rule is the controller's in `@maple-kit/mock/client`.
 */

import { MOCK_STATES } from "@maple-kit/core/mock";
import { createOverlayHost } from "@maple-kit/core/overlay";
import { useMock } from "@maple-kit/react/mock";
import {
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { MapleUiContext } from "../context.js";
import { cx } from "../part.js";
import { SCHEME_ATTRIBUTE } from "../sheet-base.js";
import { bannerSentence, callName, codecOf, MOCK_COPY, STATE_LABELS } from "./language.js";
import { MOCK_CSS } from "./sheet.js";

import type { OverlayHost } from "@maple-kit/core/overlay";
import type { MockCallRow, MockClient, MockClientState } from "@maple-kit/mock/client";
import type { ForwardedRef, ReactElement, ReactNode } from "react";

/** How the box is mounted. */
export interface MapleMockProps {
  /** A controller the caller built and owns, started and destroyed by them. */
  readonly client?: MockClient;
  /** Start with the box open. `m` opens and closes it either way. */
  readonly defaultOpen?: boolean;
  /** Added to the box. */
  readonly className?: string;
  /** For a host that mounts Maple with a script tag rather than a bundle. */
  readonly nonce?: string;
  /** Where its own host is appended. Defaults to `document.body`. */
  readonly parent?: Element;
}

/** The box, the banner, and a shadow host of their own when nothing gives one. */
export const MapleMock = /** @__PURE__ */ forwardRef<HTMLDivElement, MapleMockProps>(
  function MapleMock(props, ref) {
    const { className, client, defaultOpen, nonce, parent } = props;
    const binding = useMock({
      ...(client === undefined ? {} : { client }),
      ...(defaultOpen === undefined ? {} : { defaultOpen }),
    });
    const inside = useContext(MapleUiContext);
    if (!binding.state.installed) return null;

    const surface = createElement(MockSurface, { ...binding, className, forwarded: ref });
    if (inside !== null) return surface;
    return createElement(OwnHost, { scheme: binding.state.scheme, nonce, parent }, surface);
  },
);

interface OwnHostProps {
  readonly scheme: MockClientState["scheme"];
  readonly nonce: string | undefined;
  readonly parent: Element | undefined;
  readonly children?: ReactNode;
}

/** Mounted in an effect, so nothing reaches `document` while React renders. */
function OwnHost(props: OwnHostProps): ReactElement | null {
  const { nonce, parent, scheme } = props;
  const [host, setHost] = useState<OverlayHost>();

  useEffect(() => {
    const mounted = createOverlayHost({
      ...(nonce === undefined ? {} : { nonce }),
      ...(parent === undefined ? {} : { parent }),
    });
    mounted.addStyles(MOCK_CSS);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a portal target cannot be built during render.
    setHost(mounted);
    return () => mounted.destroy();
  }, [nonce, parent]);

  useLayoutEffect(() => {
    host?.container.setAttribute(SCHEME_ATTRIBUTE, scheme);
  }, [host, scheme]);

  if (host === undefined) return null;
  return createPortal(createElement("div", { className: "mk-layer" }, props.children), host.root);
}

interface SurfaceProps {
  readonly state: MockClientState;
  readonly client: MockClient;
  readonly className: string | undefined;
  readonly forwarded: ForwardedRef<HTMLDivElement>;
}

function MockSurface(props: SurfaceProps): ReactElement {
  const { client, state } = props;
  return createElement(
    "div",
    { className: "mk-mock-surface" },
    state.active === undefined ? null : createElement(Banner, { key: "banner", client, state }),
    state.open ? createElement(Box, { key: "box", ...props }) : null,
  );
}

/** Always drawn while a mock is on. It has no dismiss, only Turn off. */
function Banner(props: { state: MockClientState; client: MockClient }): ReactElement {
  const { client, state } = props;
  return createElement(
    "div",
    { className: "mk-mock-banner mk-live", role: "status" },
    createElement(
      "span",
      { className: "mk-mock-banner-said" },
      bannerSentence(state.active!.calls),
    ),
    state.open ? null : button(MOCK_COPY.edit, () => client.setOpen(true)),
    button(MOCK_COPY.turnOff, () => client.turnOff()),
  );
}

function Box(props: SurfaceProps): ReactElement {
  const { className, client, forwarded, state } = props;
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);

  return createElement(
    "div",
    {
      className: cx("mk-mock mk-surface mk-live", className),
      role: "dialog",
      "aria-label": MOCK_COPY.label,
      ref: forwarded,
    },
    createElement(
      "div",
      { className: "mk-mock-head" },
      createElement("input", {
        className: "mk-mock-field",
        type: "text",
        placeholder: MOCK_COPY.field,
        "aria-label": MOCK_COPY.field,
        value: state.query,
        ref: field,
        onChange: (event: { currentTarget: HTMLInputElement }) =>
          client.setQuery(event.currentTarget.value),
      }),
      createElement("kbd", { className: "mk-mock-key-hint" }, MOCK_COPY.escape),
    ),
    createElement(
      "p",
      { className: "mk-mock-route" },
      `${MOCK_COPY.routePrefix} `,
      createElement("span", { className: "mk-mono" }, state.route),
    ),
    calls(state, client),
    createElement(Foot, { client, state }),
  );
}

function calls(state: MockClientState, client: MockClient): ReactNode {
  if (state.calls.length === 0) {
    const said = state.query === "" ? MOCK_COPY.nothingRecorded : MOCK_COPY.nothingMatches;
    return createElement("p", { className: "mk-mock-empty" }, said);
  }
  return createElement(
    "ul",
    { className: "mk-mock-calls" },
    state.calls.map((row) => createElement(CallRow, { key: row.key, row, client })),
  );
}

function CallRow(props: { row: MockCallRow; client: MockClient }): ReactElement {
  const { client, row } = props;
  return createElement(
    "li",
    {
      className: "mk-mock-call",
      "data-mk-mocked": String(row.state !== undefined),
      "data-mk-seen": String(row.seen),
      title: row.seen ? row.key : `${row.key}: ${MOCK_COPY.notSeen}`,
    },
    createElement(
      "span",
      { className: "mk-mock-name mk-mono" },
      createElement("span", { className: "mk-mock-codec" }, codecOf(row.key)),
      callName(row.key),
    ),
    createElement(
      "div",
      { className: "mk-mock-states", role: "radiogroup", "aria-label": callName(row.key) },
      MOCK_STATES.map((state) =>
        createElement(
          "button",
          {
            key: state,
            type: "button",
            role: "radio",
            className: "mk-mock-state mk-press",
            "aria-checked": row.state === state,
            onClick: () => client.choose(row.key, row.state === state ? undefined : state),
          },
          STATE_LABELS[state],
        ),
      ),
    ),
  );
}

type Copy = "link" | "recipe";

interface Copied {
  readonly what: Copy;
  readonly ok: boolean;
}

/** Copy link and Copy recipe, which a page with no store shares a mock by. */
function Foot(props: { state: MockClientState; client: MockClient }): ReactElement {
  const { client, state } = props;
  const [copied, setCopied] = useState<Copied>();
  const empty = state.draft.length === 0;

  useEffect(() => {
    if (copied === undefined) return;
    const timer = setTimeout(() => setCopied(undefined), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (what: Copy) => () => {
    const done = what === "link" ? client.copyLink() : client.copyRecipe();
    done.then(
      () => setCopied({ what, ok: true }),
      () => setCopied({ what, ok: false }),
    );
  };

  return createElement(
    "div",
    { className: "mk-mock-foot" },
    button(label(copied, "link", MOCK_COPY.copyLink), copy("link"), {
      key: "link",
      disabled: empty,
    }),
    button(label(copied, "recipe", MOCK_COPY.copyRecipe), copy("recipe"), {
      key: "recipe",
      disabled: empty,
    }),
    createElement("span", { key: "spacer", className: "mk-mock-spacer" }),
    button(MOCK_COPY.apply, () => client.apply(), {
      key: "apply",
      disabled: !state.changed,
      primary: true,
    }),
  );
}

function label(copied: Copied | undefined, what: Copy, idle: string): string {
  if (copied?.what !== what) return idle;
  return copied.ok ? MOCK_COPY.copied : MOCK_COPY.copyFailed;
}

function button(
  text: string,
  onClick: () => void,
  flags: { key?: string; disabled?: boolean; primary?: boolean } = {},
): ReactElement {
  return createElement(
    "button",
    {
      key: flags.key ?? text,
      type: "button",
      className: "mk-mock-button mk-press",
      disabled: flags.disabled === true,
      "data-mk-primary": flags.primary === true ? "true" : undefined,
      onClick,
    },
    text,
  );
}
