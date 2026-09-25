/**
 * Maple's route answering `/mock/identity`. `broken` makes it fail with a
 * 500 and `absent` with a 404, so a lookup's error paths are exercised.
 */

import { http, HttpResponse } from "msw";

import { ROUTE_ORIGIN } from "./shapes.js";

import type { IdentityRules } from "@maple-kit/core/mock";
import type { RequestHandler } from "msw";

export const RULES: IdentityRules = {
  call: "rest:GET /api/session",
  role: { path: "user.role", values: ["owner", "barista", "guest"] },
  permissions: { path: "permissions", values: ["project:delete", "billing:write"] },
  requires: {
    "rest:GET /api/audit": { roles: ["owner"] },
    "rest:DELETE /api/projects/:id": { permission: "project:delete" },
  },
};

export function createIdentityRoute(answer: "rules" | "broken" | "absent" | "junk" = "rules") {
  let asked = 0;
  const handlers: RequestHandler[] = [
    http.get(`${ROUTE_ORIGIN}/api/maple/mock/identity`, () => {
      asked += 1;
      if (answer === "broken") return HttpResponse.json({ error: "upstream" }, { status: 500 });
      if (answer === "absent") return HttpResponse.json({ error: "Not found" }, { status: 404 });
      return HttpResponse.json({ identity: answer === "junk" ? { call: 3 } : RULES });
    }),
  ];
  return { handlers, asked: () => asked };
}
