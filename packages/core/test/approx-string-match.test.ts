import { describe, expect, it } from "vitest";

import { search } from "../src/lib/approx-string-match.js";

/**
 * The fewest edits turning `pattern` into any substring of `text`. Quadratic
 * and obviously right, which is exactly why it is the reference.
 */
function bestErrors(text: string, pattern: string): number {
  let row = Array.from({ length: pattern.length + 1 }, (_, index) => index);
  let best = row[pattern.length]!;

  for (const character of text) {
    const next = [0];
    for (let column = 1; column <= pattern.length; column += 1) {
      next.push(
        Math.min(
          row[column - 1]! + (pattern[column - 1] === character ? 0 : 1),
          next[column - 1]! + 1,
          row[column]! + 1,
        ),
      );
    }
    row = next;
    best = Math.min(best, row[pattern.length]!);
  }
  return best;
}

describe("approximate search", () => {
  it("finds an exact occurrence", () => {
    expect(search("the quick brown fox", "brown", 0)).toEqual([{ start: 10, end: 15, errors: 0 }]);
  });

  it("finds an occurrence with a substitution", () => {
    const [match] = search("the quick brawn fox", "brown", 1);
    expect(match).toMatchObject({ start: 10, end: 15, errors: 1 });
  });

  it("finds an occurrence with a deletion", () => {
    const [match] = search("the quick brwn fox", "brown", 1);
    expect(match?.errors).toBe(1);
    expect("the quick brwn fox".slice(match!.start, match!.end)).toBe("brwn");
  });

  it("finds an occurrence with an insertion", () => {
    const [match] = search("the quick broewn fox", "brown", 1);
    expect(match?.errors).toBe(1);
    expect("the quick broewn fox".slice(match!.start, match!.end)).toBe("broewn");
  });

  it("finds nothing when the budget is too small", () => {
    expect(search("the quick brawn fox", "brown", 0)).toEqual([]);
  });

  it("reports one match per occurrence, not one per shift", () => {
    expect(search("ab ab ab", "ab", 0)).toHaveLength(3);
  });

  it("reports nothing for an empty pattern", () => {
    expect(search("anything", "", 4)).toEqual([]);
  });

  it("reports nothing for a negative budget", () => {
    expect(search("anything", "any", -1)).toEqual([]);
  });

  it("matches at the very start and the very end", () => {
    expect(search("abcdef", "abc", 0)[0]).toEqual({ start: 0, end: 3, errors: 0 });
    expect(search("abcdef", "def", 0)[0]).toEqual({ start: 3, end: 6, errors: 0 });
  });

  it("returns a span the caller can slice out", () => {
    const text = "Total revenue for the quarter";
    const [match] = search(text, "revenue for", 0);
    expect(text.slice(match!.start, match!.end)).toBe("revenue for");
  });
});

describe("approximate search, against a brute-force reference", () => {
  const ALPHABET = "abcd ";

  function randomString(random: () => number, length: number): string {
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += ALPHABET[Math.floor(random() * ALPHABET.length)];
    }
    return out;
  }

  /** A seeded generator, so a failure is reproducible from the case number. */
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it("agrees with the reference on 200 random inputs", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = seeded(seed);
      const text = randomString(random, 60);
      const pattern = randomString(random, 1 + Math.floor(random() * 8));
      const budget = Math.floor(random() * 4);

      const expected = bestErrors(text, pattern);
      const matches = search(text, pattern, budget);

      if (expected > budget) {
        expect(matches, `seed ${seed}`).toEqual([]);
        continue;
      }
      expect(Math.min(...matches.map((match) => match.errors)), `seed ${seed}`).toBe(expected);
    }
  });

  it("returns spans that really are as close as it claims", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = seeded(seed + 1000);
      const text = randomString(random, 60);
      const pattern = randomString(random, 1 + Math.floor(random() * 8));
      const budget = Math.floor(random() * 4);

      for (const match of search(text, pattern, budget)) {
        const span = text.slice(match.start, match.end);
        expect(match.end, `seed ${seed}`).toBeGreaterThan(match.start);
        expect(match.errors, `seed ${seed}`).toBeLessThanOrEqual(budget);
        expect(bestErrors(span, pattern), `seed ${seed}`).toBeLessThanOrEqual(match.errors);
      }
    }
  });
});
