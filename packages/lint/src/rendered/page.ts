/**
 * The entry the browser loads. It exists so the reader and the anchor cascade
 * it uses arrive in the page as one bundle: a function handed to
 * `page.evaluate` is serialised by `toString()`, and anything it imported
 * would not come with it.
 */

import { readPage } from "./collect.js";

import type { JudgedRead, Reading } from "./collect.js";

declare global {
  interface Window {
    /** Set by this bundle; the driver calls it once per pass. */
    __mapleLintRead?: (judged: JudgedRead) => Reading;
  }
}

window.__mapleLintRead = readPage;
