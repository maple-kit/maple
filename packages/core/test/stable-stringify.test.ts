import { describe, expect, it } from "vitest";

import { CyclicValueError, stableStringify } from "../src/lib/stable-stringify.js";

describe("stableStringify", () => {
  it("produces identical output for objects that differ only in key order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("sorts keys lexicographically", () => {
    expect(stableStringify({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });

  it("sorts nested objects too", () => {
    expect(stableStringify({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("sorts objects inside arrays", () => {
    expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("drops undefined, function and symbol values like JSON.stringify", () => {
    const value = { kept: 1, gone: undefined, fn: () => 0, sym: Symbol("s") };

    expect(stableStringify(value)).toBe('{"kept":1}');
  });

  it("indents when given a space argument", () => {
    expect(stableStringify({ b: 1, a: 2 }, 2)).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });

  it("round-trips through JSON.parse", () => {
    const value = { b: [1, { d: 4, c: 3 }], a: "x" };

    expect(JSON.parse(stableStringify(value))).toEqual(value);
  });

  it("throws CyclicValueError naming where the cycle closes", () => {
    const value: Record<string, unknown> = { name: "root" };
    value["self"] = { inner: value };

    expect(() => stableStringify(value)).toThrow(CyclicValueError);
    expect(() => stableStringify(value)).toThrow(/self\.inner/);
  });

  it("allows the same object twice when it is not a cycle", () => {
    const shared = { a: 1 };

    expect(stableStringify({ x: shared, y: shared })).toBe('{"x":{"a":1},"y":{"a":1}}');
  });
});
