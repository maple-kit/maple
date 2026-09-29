/**
 * Unsent comments leaving one browser and arriving in another.
 *
 * The file is the draft store's own shape with a version and the branch it was
 * written on, so nothing is lost that markdown drops: anchors, regions and
 * page context. Reading is forgiving about entries and strict about the file:
 * one bad entry is counted and skipped, a file that is not an export at all is
 * refused, and nothing is guessed in between.
 */

import { isDraft } from "../overlay/drafts.js";

import type { Draft } from "../overlay/drafts.js";

/** The only shape written so far. A file with another number is refused. */
export const DRAFT_EXPORT_VERSION = 1;

/** What an export file holds. */
export interface DraftExport {
  readonly version: typeof DRAFT_EXPORT_VERSION;
  readonly branch: string;
  readonly drafts: readonly Draft[];
}

/** Why a file was refused. */
export type DraftExportRefusal = "unreadable" | "unsupported";

/** A file that was understood, with a count of what in it was not. */
export type DraftExportRead =
  | {
      readonly ok: true;
      readonly branch: string;
      readonly drafts: readonly Draft[];
      readonly invalid: number;
    }
  | { readonly ok: false; readonly reason: DraftExportRefusal };

/** What a file would do, before anything is asked or added. */
export type DraftImportPreview =
  | {
      readonly ok: true;
      /** The branch the drafts were written on. */
      readonly branch: string;
      /** False when it is not this one, which is worth asking about. */
      readonly sameBranch: boolean;
      readonly count: number;
      readonly invalid: number;
    }
  | { readonly ok: false; readonly reason: DraftExportRefusal };

/** What importing did, or why it did nothing. */
export type DraftImportOutcome =
  | ({ readonly ok: true } & DraftImportResult)
  | { readonly ok: false; readonly reason: DraftExportRefusal };

/** What importing changed, in the words a reviewer is told. */
export interface DraftImportResult {
  readonly added: number;
  /** Already here, or sent from here since. */
  readonly skipped: number;
  /** Older than a draft is kept, so the next load would drop it. */
  readonly expired: number;
  /** Entries in the file that were not drafts. */
  readonly invalid: number;
}

/** Drafts found under another branch's key on this origin. */
export interface ForeignDrafts {
  readonly branch: string;
  readonly count: number;
}

/** The export as text, newest first as the store lists them. */
export function writeDraftExport(branch: string, drafts: readonly Draft[]): string {
  const file: DraftExport = { version: DRAFT_EXPORT_VERSION, branch, drafts };
  return JSON.stringify(file, null, 2);
}

/** Reads an export back, or says why it cannot. */
export function readDraftExport(text: string): DraftExportRead {
  const parsed = parse(text);
  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "unreadable" };

  const file = parsed as Partial<Record<keyof DraftExport, unknown>>;
  if (typeof file.branch !== "string" || !Array.isArray(file.drafts)) {
    return { ok: false, reason: "unreadable" };
  }
  if (file.version !== DRAFT_EXPORT_VERSION) return { ok: false, reason: "unsupported" };

  const drafts = (file.drafts as unknown[]).filter(isDraft);
  return { ok: true, branch: file.branch, drafts, invalid: file.drafts.length - drafts.length };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
