import { identityRules, isIdentityRules } from "@maple-kit/core/mock";
import { describe, expect, it } from "vitest";

import type { JsonSchema, Shape } from "@maple-kit/core/mock";

const CALL = "rest:GET /api/session";

function shape(schema: JsonSchema): Shape {
  return { schema, source: "supplied" };
}

const ROLE = { type: "string", enum: ["owner", "barista", "guest"] };

describe("identityRules", () => {
  it.each([
    ["an enum at the path", shape({ type: "object", properties: { role: ROLE } }), "role"],
    [
      "a nested path through a $ref",
      shape({
        type: "object",
        properties: { user: { $ref: "#/$defs/User" } },
        $defs: { User: { type: "object", properties: { role: ROLE } } },
      }),
      "user.role",
    ],
    [
      "a nullable union around the object",
      shape({
        type: "object",
        properties: {
          user: { anyOf: [{ type: "null" }, { type: "object", properties: { role: ROLE } }] },
        },
      }),
      "user.role",
    ],
  ])("reads the roles from %s", (_, callShape, path) => {
    const rules = identityRules({ call: CALL, role: { path } }, callShape);
    expect(rules.role).toEqual({ path, values: ["owner", "barista", "guest"] });
  });

  it.each([
    [
      "a list's item enum",
      { type: "array", items: { type: "string", enum: ["roast:delete", "billing:write"] } },
      ["roast:delete", "billing:write"],
    ],
    [
      "an object's keys",
      {
        type: "object",
        properties: { canDelete: { type: "boolean" }, canBill: { type: "boolean" } },
      },
      ["canDelete", "canBill"],
    ],
  ])("reads the permissions from %s", (_, permissions, values) => {
    const rules = identityRules(
      { call: CALL, permissions: { path: "permissions" } },
      shape({ type: "object", properties: { permissions } }),
    );
    expect(rules.permissions?.values).toEqual(values);
  });

  it("prefers the host's words to the shape's, and adds every word requires names", () => {
    const rules = identityRules(
      {
        call: CALL,
        role: { path: "role", values: ["admin"] },
        permissions: { path: "permissions" },
        requires: {
          "rest:GET /api/audit": { roles: ["admin", "auditor"] },
          "rest:DELETE /api/roasts/:id": { permission: "roast:delete" },
        },
      },
      shape({ type: "object", properties: { role: ROLE } }),
    );
    expect(rules.role?.values).toEqual(["admin", "auditor"]);
    expect(rules.permissions?.values).toEqual(["roast:delete"]);
    expect(isIdentityRules(rules)).toBe(true);
  });

  it("has no words for a field without a shape, and leaves out a field not declared", () => {
    const rules = identityRules({ call: CALL, role: { path: "role" } });
    expect(rules).toEqual({ call: CALL, role: { path: "role", values: [] }, requires: {} });
  });
});

describe("isIdentityRules", () => {
  it.each([
    ["null", null],
    ["no call", { requires: {} }],
    ["no requires", { call: CALL }],
    ["a role without a path", { call: CALL, requires: {}, role: { values: [] } }],
    [
      "values that are not words",
      { call: CALL, requires: {}, role: { path: "role", values: [1] } },
    ],
  ])("refuses %s", (_, value) => {
    expect(isIdentityRules(value)).toBe(false);
  });
});
