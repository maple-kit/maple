/**
 * Reading a source map: which original line and column a generated one came from.
 *
 * Replaces `@jridgewell/trace-mapping` and `source-map-js`. One lookup is
 * needed, from the mappings a dev server already serves inline, so the port is
 * the base64 VLQ decoder and a search over one line's segments. Written from
 * the Source Map v3 specification. Index maps (`sections`) are not read, and a
 * map that uses one answers nothing rather than guessing.
 */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CONTINUATION = 0b10_0000;
const DIGIT_MASK = 0b1_1111;
const DIGIT_BITS = 5;

/** The fields of a version 3 map this reads. */
export interface RawSourceMap {
  readonly version?: number;
  readonly sources?: readonly (string | null)[];
  readonly sourceRoot?: string;
  readonly mappings?: string;
  readonly sections?: unknown;
}

/** Where a generated position came from. Line is 1-based and column 0-based, as in a map. */
export interface OriginalPosition {
  readonly source: string;
  readonly line: number;
  readonly column: number;
}

/** Answers one lookup: a 1-based generated line and a 0-based column. */
export type SourceMapReader = (line: number, column: number) => OriginalPosition | undefined;

/** Generated column, source index, original line and original column, all absolute. */
type Segment = readonly [number, number, number, number];

/** Decodes one comma-free run of base64 VLQ into its signed numbers. */
export function decodeVlq(text: string): number[] {
  const values: number[] = [];
  let accumulated = 0;
  let shift = 0;
  for (const char of text) {
    const digit = BASE64.indexOf(char);
    if (digit === -1) throw new RangeError(`"${char}" is not a base64 digit.`);
    accumulated += (digit & DIGIT_MASK) * 2 ** shift;
    if (digit & CONTINUATION) {
      shift += DIGIT_BITS;
      continue;
    }
    const magnitude = Math.floor(accumulated / 2);
    values.push(accumulated % 2 === 1 ? 0 - magnitude : magnitude);
    accumulated = 0;
    shift = 0;
  }
  return values;
}

/** Every generated line's segments, with the running offsets the format stores as deltas. */
function decodeMappings(mappings: string): Segment[][] {
  let source = 0;
  let line = 0;
  let column = 0;
  return mappings.split(";").map((group) => {
    let generated = 0;
    const segments: Segment[] = [];
    for (const text of group.split(",")) {
      const [dGenerated, dSource, dLine, dColumn] = decodeVlq(text);
      if (dGenerated === undefined) continue;
      generated += dGenerated;
      // A segment of one field maps to no source, so there is nothing to record.
      if (dSource === undefined || dLine === undefined || dColumn === undefined) continue;
      source += dSource;
      line += dLine;
      column += dColumn;
      segments.push([generated, source, line, column]);
    }
    return segments;
  });
}

/** The last segment that starts at or before `column`, which is the one covering it. */
function segmentAt(segments: readonly Segment[], column: number): Segment | undefined {
  let found: Segment | undefined;
  for (const segment of segments) {
    if (segment[0] > column) break;
    found = segment;
  }
  return found;
}

/** The source as the map names it, joined onto its `sourceRoot` when it has one. */
function sourceName(map: RawSourceMap, index: number): string | undefined {
  const name = map.sources?.[index];
  if (typeof name !== "string") return undefined;
  const root = map.sourceRoot ?? "";
  if (root === "" || name.startsWith("/") || name.includes("://")) return name;
  return `${root.replace(/\/$/, "")}/${name}`;
}

/**
 * A lookup over `map`, or undefined when it is not a map this can read. The
 * mappings are decoded once, so a reader is worth keeping for every lookup in
 * the same file.
 */
export function readSourceMap(map: RawSourceMap): SourceMapReader | undefined {
  if (map.version !== 3 || typeof map.mappings !== "string" || map.sections !== undefined) {
    return undefined;
  }
  let lines: Segment[][];
  try {
    lines = decodeMappings(map.mappings);
  } catch {
    return undefined;
  }

  return (line, column) => {
    const segment = segmentAt(lines[line - 1] ?? [], column);
    if (segment === undefined) return undefined;
    const source = sourceName(map, segment[1]);
    return source === undefined ? undefined : { source, line: segment[2] + 1, column: segment[3] };
  };
}
