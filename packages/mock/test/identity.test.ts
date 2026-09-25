import { impose, meetsNeed, realIdentity } from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

import { SESSION } from "./msw/api.js";
import { RULES } from "./msw/identity.js";

import type { IdentityRules, MockIdentity } from "@maple-kit/core/mock";
import type { RealIdentity } from "@maple-kit/mock";

const OBJECT_RULES: IdentityRules = {
  ...RULES,
  permissions: { path: "can", values: ["deleteProject", "bill"] },
};

describe("realIdentity", () => {
  it.each([
    [
      "a list of names",
      RULES,
      SESSION,
      { role: "owner", permissions: ["project:delete", "billing:write"] },
    ],
    [
      "an object of booleans",
      OBJECT_RULES,
      { user: { role: "guest" }, can: { deleteProject: false, bill: true } },
      { role: "guest", permissions: ["bill"] },
    ],
    ["an answer without the fields", RULES, { user: null }, {}],
  ])("reads %s", (_, rules, body, expected) => {
    const real = realIdentity(body, rules);
    expect({
      ...real,
      ...(real.permissions ? { permissions: [...real.permissions] } : {}),
    }).toEqual(expected);
  });
});

describe("meetsNeed", () => {
  const owner: RealIdentity = { role: "owner", permissions: new Set(["project:delete"]) };

  it.each<[string, string, MockIdentity, RealIdentity, boolean]>([
    ["a call nothing requires", "rest:GET /api/projects", { role: "guest" }, owner, true],
    ["a role the call allows", "rest:GET /api/audit", { role: "owner" }, {}, true],
    ["a role the call does not allow", "rest:GET /api/audit", { role: "guest" }, owner, false],
    [
      "the real role, when `as` names none",
      "rest:GET /api/audit",
      { permissions: {} },
      owner,
      true,
    ],
    ["a role nobody knows", "rest:GET /api/audit", { permissions: {} }, {}, true],
    [
      "a permission taken away",
      "rest:DELETE /api/projects/:id",
      { permissions: { "project:delete": false } },
      owner,
      false,
    ],
    [
      "a permission granted",
      "rest:DELETE /api/projects/:id",
      { permissions: { "project:delete": true } },
      {},
      true,
    ],
    [
      "the real permission, when `as` does not name it",
      "rest:DELETE /api/projects/:id",
      { role: "guest" },
      owner,
      true,
    ],
    [
      "a real permission missing",
      "rest:DELETE /api/projects/:id",
      { role: "guest" },
      { permissions: new Set() },
      false,
    ],
  ])("judges %s", (...[, key, as, real, met]) => {
    expect(meetsNeed(key, as, RULES, real)).toBe(met);
  });
});

describe("impose", () => {
  it("writes the role and the permission changes in, leaving the rest and the input alone", () => {
    const shown = impose(
      SESSION,
      { role: "barista", permissions: { "project:delete": false, "roast:approve": true } },
      RULES,
    );
    expect(shown).toEqual({
      user: { name: "Reviewer", role: "barista" },
      permissions: ["billing:write", "roast:approve"],
    });
    expect(SESSION.user.role).toBe("owner");
  });

  it("sets each named key of a permission object", () => {
    const body = { user: { role: "guest" }, can: { deleteProject: true, bill: true } };
    expect(impose(body, { permissions: { bill: false } }, OBJECT_RULES)).toEqual({
      user: { role: "guest" },
      can: { deleteProject: true, bill: false },
    });
  });

  it.each([
    ["a role the rules do not list", { role: "wizard" }],
    ["a path whose parent is missing", { role: "barista" }, { name: "no user here" }],
  ])("leaves the answer as it was for %s", (_, as, body: unknown = SESSION) => {
    expect(impose(body, as, RULES)).toEqual(body);
  });
});
