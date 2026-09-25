/**
 * Maple Mock's box: `MapleMock`, which mounts alone or inside `<Maple />`.
 *
 * Its own subpath, and its graph reaches none of the island, the composer or
 * the marks; `scripts/size.js` fails the build if it ever does.
 */

export {
  bannerSentence,
  callName,
  codecOf,
  MOCK_COPY,
  STATE_LABELS,
  STATE_SENTENCES,
} from "./language.js";
export { MapleMock, MapleMock as Mock } from "./mock.js";
export type { MapleMockProps } from "./mock.js";
export { MOCK_CSS } from "./sheet.js";
