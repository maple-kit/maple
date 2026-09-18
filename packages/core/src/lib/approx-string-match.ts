/**
 * Approximate substring search: every place a pattern occurs in a text within
 * a budget of single-character edits.
 *
 * Derived from approx-string-match (Robert Knight, MIT). That library runs
 * Myers' bit-parallel algorithm; this is Sellers' dynamic programme with
 * Ukkonen's cutoff instead, which is a page of arithmetic rather than a page of
 * bit tricks and is verifiable against a brute-force reference. The cutoff
 * keeps it near O(text × maxErrors), fast enough for re-anchoring a page.
 */

/** One place the pattern occurs, and how far off it was. */
export interface ApproxMatch {
  /** Index of the first character of the match. */
  readonly start: number;
  /** Index one past the last character of the match. */
  readonly end: number;
  /** Single-character insertions, deletions and substitutions used. */
  readonly errors: number;
}

/**
 * Every approximate occurrence of `pattern` in `text`, at most one per end
 * position, each the best alignment ending there.
 *
 * Returns nothing for an empty pattern: every position would match it.
 */
export function search(text: string, pattern: string, maxErrors: number): ApproxMatch[] {
  const patternLength = pattern.length;
  if (patternLength === 0 || maxErrors < 0) return [];

  const budget = Math.floor(maxErrors);
  const cost = new Int32Array(patternLength + 1);
  const origin = new Int32Array(patternLength + 1);
  for (let index = 0; index <= patternLength; index += 1) cost[index] = index;

  let active = Math.min(budget + 1, patternLength);
  const matches: ApproxMatch[] = [];

  for (let index = 0; index < text.length; index += 1) {
    active = advance(text, pattern, { cost, origin }, { index, active, budget });
    if (active === patternLength && cost[patternLength]! <= budget) {
      matches.push({
        start: origin[patternLength]!,
        end: index + 1,
        errors: cost[patternLength]!,
      });
    }
  }

  return bestPerRun(matches);
}

interface Row {
  readonly cost: Int32Array;
  readonly origin: Int32Array;
}

interface Position {
  readonly index: number;
  readonly active: number;
  readonly budget: number;
}

/**
 * Fills one row of the matrix for `text[index]` and returns the new active
 * width. Only cells that can still come in under budget are computed.
 */
function advance(text: string, pattern: string, row: Row, at: Position): number {
  const { cost, origin } = row;
  const { index } = at;
  const character = text[index];

  let diagonalCost = cost[0]!;
  let diagonalOrigin = origin[0]!;
  cost[0] = 0;
  origin[0] = index + 1;

  for (let column = 1; column <= at.active; column += 1) {
    const substitute = diagonalCost + (pattern[column - 1] === character ? 0 : 1);
    const insert = cost[column - 1]! + 1;
    const remove = cost[column]! + 1;
    const aboveCost = cost[column]!;
    const aboveOrigin = origin[column]!;

    if (substitute <= insert && substitute <= remove) {
      cost[column] = substitute;
      origin[column] = diagonalOrigin;
    } else if (insert <= remove) {
      cost[column] = insert;
      origin[column] = origin[column - 1]!;
    } else {
      cost[column] = remove;
      origin[column] = aboveOrigin;
    }

    diagonalCost = aboveCost;
    diagonalOrigin = aboveOrigin;
  }

  return resize(cost, at.active, pattern.length, at.budget);
}

/** Shrinks the active width past cells that can no longer come in under budget. */
function resize(cost: Int32Array, active: number, patternLength: number, budget: number): number {
  let width = active;
  while (width > 0 && cost[width]! > budget) width -= 1;
  if (width === patternLength) return width;

  width += 1;
  cost[width] = budget + 1;
  return width;
}

/**
 * Keeps one match per run of adjacent end positions, the one with the fewest
 * errors, so a single occurrence is reported once rather than once per shift.
 */
function bestPerRun(matches: ApproxMatch[]): ApproxMatch[] {
  const kept: ApproxMatch[] = [];
  for (const match of matches) {
    const previous = kept[kept.length - 1];
    if (previous && match.start < previous.end) {
      if (match.errors < previous.errors) kept[kept.length - 1] = match;
      continue;
    }
    kept.push(match);
  }
  return kept;
}
