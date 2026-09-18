/**
 * The build-time JSX tagger and the DOM contract it writes.
 *
 * This entrypoint runs in a build, not in a browser. The attribute constants
 * are exported from here as well because everything that reads an anchor has
 * to agree with what the tagger wrote.
 */

export {
  ATTRIBUTE_PATTERN,
  ATTRIBUTE_PREFIX,
  formatSourceLocation,
  KEY_ATTRIBUTE,
  NAME_ATTRIBUTE,
  parseSourceLocation,
  SOURCE_ATTRIBUTE,
} from "./attributes.js";
export type { SourceLocation } from "./attributes.js";

export { mapleTagger } from "./babel.js";
export type { TaggerOptions } from "./babel.js";
