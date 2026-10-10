/**
 * `SignIn`: the popup that walks a reviewer through linking GitHub.
 *
 * The code and the link used to live only in the settings panel, behind a
 * button that said nothing about needing them. Pressing Sign in now opens this
 * instead: the code to copy, the page to paste it on, and a line that says the
 * overlay is waiting and will close itself. Closing it early keeps the link
 * running; the settings row still shows the same code.
 */

import { useGitHubLink } from "@maple-kit/react";
import { createElement, useState } from "react";

import { SIGNIN_COPY } from "./island/language.js";
import { Popup } from "./popup.js";
import { SoloOffer } from "./solo.js";

import type { ReactElement } from "react";

/** How long the button says it copied. */
const COPIED_MS = 1600;

/** Open for as long as a link is waiting and the reviewer has not closed it. */
export function SignIn(): ReactElement | null {
  const link = useGitHubLink();
  const [closed, setClosed] = useState<string | null>(null);

  if (link.state !== "linking" || closed === link.userCode) return null;

  return createElement(Steps, {
    code: link.userCode,
    uri: link.verificationUri,
    onClose: () => setClosed(link.userCode),
  });
}

interface StepsProps {
  readonly code: string;
  readonly uri: string;
  readonly onClose: () => void;
}

function Steps(props: StepsProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(props.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => undefined,
    );
  };

  return createElement(
    Popup,
    { title: SIGNIN_COPY.title, onClose: props.onClose },
    createElement(
      "ol",
      { className: "mk-steps" },
      createElement(
        "li",
        { key: "copy" },
        createElement("span", { className: "mk-step-said" }, SIGNIN_COPY.copyStep),
        createElement(
          "span",
          { className: "mk-code-row" },
          createElement("code", { className: "mk-step-code" }, props.code),
          createElement(
            "button",
            { type: "button", className: "mk-acct-do", onClick: copy },
            copied ? SIGNIN_COPY.copied : SIGNIN_COPY.copy,
          ),
        ),
      ),
      createElement(
        "li",
        { key: "open" },
        createElement("span", { className: "mk-step-said" }, SIGNIN_COPY.openStep),
        createElement(
          "a",
          {
            className: "mk-step-open",
            href: props.uri,
            target: "_blank",
            rel: "noreferrer noopener",
          },
          SIGNIN_COPY.open,
        ),
      ),
    ),
    createElement(
      "p",
      { className: "mk-step-wait", role: "status" },
      createElement("span", { className: "mk-step-dot", "aria-hidden": "true" }),
      SIGNIN_COPY.waiting,
    ),
    createElement("div", { className: "mk-step-help" }, createElement(SoloOffer)),
  );
}
