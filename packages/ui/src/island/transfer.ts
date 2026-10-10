/**
 * `Maple.ImportDrafts` and `Maple.OtherDrafts`: unsent comments arriving.
 *
 * Both are quiet on purpose. Import is one icon button until it is wanted, with
 * Download beside it, and the other-branch row says what was found and does nothing until asked, since
 * a label that differs can be legitimate. Nothing here re-keys a draft on its
 * own; it only calls the client, which saves through the draft keeper.
 */

import { useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useState } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { TRANSFER_COPY } from "./language.js";
import { useSavedDrafts, useSignedOut } from "./saved.js";

import type { PartProps } from "../part.js";
import type {
  DraftImportOutcome,
  DraftImportPreview,
  DraftImportResult,
  MapleClient,
} from "@maple-kit/core/client";
import type { ChangeEvent, DragEvent, MouseEvent, ReactNode } from "react";

/** The section. Its children replace everything inside it. */
export interface ImportDraftsProps extends PartProps {
  readonly children?: ReactNode;
}

/** The row. Its children replace everything inside it. */
export interface OtherDraftsProps extends PartProps {
  readonly children?: ReactNode;
}

/** The result of an import in a sentence: what was added, then what was not. */
function said(result: DraftImportResult): string {
  return TRANSFER_COPY.result(result);
}

/** Import from a paste or a file, drawn as one quiet button until it is used. */
export const ImportDrafts = /** @__PURE__ */ forwardRef<HTMLDivElement, ImportDraftsProps>(
  function ImportDrafts(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const client = useMapleClient();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [note, setNote] = useState<string | undefined>();
    const [asking, setAsking] = useState<Extract<DraftImportPreview, { ok: true }> | undefined>();

    const settle = (outcome: DraftImportOutcome): void => {
      setNote(outcome.ok ? said(outcome) : TRANSFER_COPY[outcome.reason]);
      if (outcome.ok) setText("");
      setAsking(undefined);
    };
    const add = (): void => {
      const preview = client.previewDraftImport(text);
      if (!preview.ok) return settle(preview);
      if (preview.sameBranch) return settle(client.importDrafts(text));
      setNote(undefined);
      setAsking(preview);
    };
    const load = (file: File | undefined): void => {
      void file?.text().then(setText, () => setNote(TRANSFER_COPY.unreadable));
    };

    const body = asking
      ? createElement(
          "div",
          { key: "ask", className: "mk-transfer-ask", role: "alert" },
          createElement("span", null, TRANSFER_COPY.ask(asking.branch, asking.count)),
          button(TRANSFER_COPY.addHere, () => settle(client.importDrafts(text))),
          button(TRANSFER_COPY.cancel, () => setAsking(undefined)),
        )
      : [
          createElement("textarea", {
            key: "box",
            className: "mk-transfer-box",
            "aria-label": TRANSFER_COPY.boxLabel,
            placeholder: TRANSFER_COPY.boxHint,
            value: text,
            rows: 3,
            onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value),
            onDragOver: (event: DragEvent) => event.preventDefault(),
            onDrop: (event: DragEvent) => {
              event.preventDefault();
              load(event.dataTransfer.files[0]);
            },
          }),
          createElement(
            "div",
            { key: "row", className: "mk-transfer-row" },
            createElement("input", {
              type: "file",
              accept: "application/json,.json",
              className: "mk-transfer-file",
              "aria-label": TRANSFER_COPY.fileLabel,
              onChange: (event: ChangeEvent<HTMLInputElement>) => load(event.target.files?.[0]),
            }),
            button(TRANSFER_COPY.add, add, text.trim() === ""),
          ),
        ];

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-transfer", className), ref },
      children ?? [
        createElement(
          "button",
          {
            key: "toggle",
            type: "button",
            className: "mk-icon-btn mk-press",
            "aria-label": open ? TRANSFER_COPY.close : TRANSFER_COPY.open,
            title: open ? TRANSFER_COPY.close : TRANSFER_COPY.open,
            "aria-expanded": open,
            onClick: () => setOpen(!open),
          },
          uploadIcon(),
        ),
        createElement(DownloadDrafts, { key: "download" }),
        open
          ? createElement(
              "div",
              { key: "panel", className: "mk-transfer-panel" },
              body,
              noteLine(note),
            )
          : null,
      ],
    );
  },
);

/**
 * Saves the drafts as a file another browser can import. A green dot says
 * there is something to carry out while publishing is not possible.
 */
function DownloadDrafts(): ReactNode {
  const client = useMapleClient();
  const saved = useSavedDrafts();
  const signedOut = useSignedOut();
  const waiting = signedOut && saved.length > 0;

  return createElement(
    "button",
    {
      type: "button",
      className: "mk-icon-btn mk-press",
      "aria-label": TRANSFER_COPY.download,
      title: TRANSFER_COPY.download,
      disabled: saved.length === 0,
      "data-mk-dot": waiting,
      onClick: (event: MouseEvent<HTMLButtonElement>) => save(event.currentTarget, client),
    },
    downloadIcon(),
    waiting ? createElement("span", { className: "mk-icon-dot", "aria-hidden": true }) : null,
  );
}

/** Hands the browser the drafts as a file. */
function save(from: HTMLElement, client: MapleClient): void {
  const url = URL.createObjectURL(new Blob([client.draftsAsJson()], { type: "application/json" }));
  const link = from.ownerDocument.createElement("a");
  link.href = url;
  link.download = TRANSFER_COPY.downloadFile;
  link.click();
  URL.revokeObjectURL(url);
}

/** An arrow falling into a tray: the file comes out of the island. */
function downloadIcon(): ReactNode {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 15,
      height: 15,
      "aria-hidden": true,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d: "M12 4v11" }),
    createElement("path", { d: "M7.5 10.5L12 15l4.5-4.5" }),
    createElement("path", { d: "M4.5 14.5v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5" }),
  );
}

/** An arrow rising out of a tray: the file goes up into the island. */
function uploadIcon(): ReactNode {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 15,
      height: 15,
      "aria-hidden": true,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d: "M12 15V4" }),
    createElement("path", { d: "M7.5 8.5L12 4l4.5 4.5" }),
    createElement("path", { d: "M4.5 14.5v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5" }),
  );
}

/** A row that says drafts exist under another branch here, and offers to bring them. */
export const OtherDrafts = /** @__PURE__ */ forwardRef<HTMLDivElement, OtherDraftsProps>(
  function OtherDrafts(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const client = useMapleClient();
    const [found, setFound] = useState(() => client.foreignDrafts());
    const [first] = found;

    if (first === undefined) return null;
    const refresh = (): void => setFound(client.foreignDrafts());

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-transfer-other", className), ref },
      children ?? [
        createElement(
          "span",
          { key: "said", className: "mk-transfer-said" },
          `${TRANSFER_COPY.found(first.count)} `,
          createElement("code", null, first.branch),
        ),
        button(TRANSFER_COPY.move, () => {
          client.moveDrafts(first.branch);
          refresh();
        }),
        button(TRANSFER_COPY.dismiss, () => {
          client.dismissDrafts(first.branch);
          refresh();
        }),
      ],
    );
  },
);

/** The small quiet button both rows share. */
function button(
  label: string,
  onClick: () => void,
  disabled = false,
  more: Record<string, unknown> = {},
): ReactNode {
  return createElement(
    "button",
    { type: "button", className: "mk-unsent-copy", key: label, onClick, disabled, ...more },
    label,
  );
}

/** What the last import said, once it has said anything. */
function noteLine(note: string | undefined): ReactNode {
  if (note === undefined) return null;
  return createElement("p", { key: "note", className: "mk-transfer-note", role: "status" }, note);
}
