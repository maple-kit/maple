import { describe, expect, it } from "vitest";

import { MapleConfigError, validateConfig, validateConfigSync } from "../src/config/validate.js";

import type { StandardSchemaV1 } from "@standard-schema/spec";

/** A minimal Standard Schema v1 implementation, so the test takes no dependency. */
function portSchema(options: { async?: boolean } = {}): StandardSchemaV1<unknown, number> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate(value) {
        const result =
          typeof value === "number" && Number.isInteger(value) && value > 0
            ? { value }
            : { issues: [{ message: "must be a positive integer", path: ["port"] }] };

        return options.async === true ? Promise.resolve(result) : result;
      },
    },
  };
}

describe("validateConfig", () => {
  it("returns the parsed value when the schema accepts it", async () => {
    await expect(validateConfig(portSchema(), 8080)).resolves.toBe(8080);
  });

  it("awaits an asynchronous schema", async () => {
    await expect(validateConfig(portSchema({ async: true }), 8080)).resolves.toBe(8080);
  });

  it("throws MapleConfigError listing the path and message", async () => {
    await expect(validateConfig(portSchema(), -1, "server options")).rejects.toThrow(
      MapleConfigError,
    );
    await expect(validateConfig(portSchema(), -1, "server options")).rejects.toThrow(
      /Invalid server options:\n\s+port: must be a positive integer/,
    );
  });
});

describe("validateConfigSync", () => {
  it("returns the parsed value", () => {
    expect(validateConfigSync(portSchema(), 8080)).toBe(8080);
  });

  it("throws MapleConfigError on invalid input", () => {
    expect(() => validateConfigSync(portSchema(), 0)).toThrow(MapleConfigError);
  });

  it("refuses an asynchronous schema rather than returning a Promise", () => {
    expect(() => validateConfigSync(portSchema({ async: true }), 8080)).toThrow(TypeError);
    expect(() => validateConfigSync(portSchema({ async: true }), 8080)).toThrow(
      /use validateConfig\(\)/,
    );
  });
});
