import { encodeRecipe, linkRecipe, recipeCookie } from "@maple-kit/core/mock";
import { requestRecipe } from "@maple-kit/mock/server";
import { describe, expect, it } from "vitest";

import type { Recipe } from "@maple-kit/core/mock";

const PAGE = "https://preview.example/beans/7";
const linked: Recipe = { version: 2, calls: [], flags: { "new-roaster": true } };
const kept: Recipe = { version: 2, calls: [], as: { role: "barista" } };
const cookie = (recipe: Recipe) => (recipeCookie(recipe, true) ?? "").split(";")[0] ?? "";

describe("requestRecipe", () => {
  it.each([
    ["a Fetch request's headers", new Headers({ cookie: `theme=dark; ${cookie(kept)}` })],
    ["Node's header object", { cookie: `theme=dark; ${cookie(kept)}` }],
    ["Node's header object, cookies as a list", { cookie: ["theme=dark", cookie(kept)] }],
  ])("reads the cookie from %s", (_, headers) => {
    expect(requestRecipe({ url: PAGE, headers })).toEqual(kept);
  });

  it("prefers a link in the request's own URL over the cookie", () => {
    const url = linkRecipe(PAGE, linked).href;
    expect(requestRecipe({ url, headers: { cookie: cookie(kept) } })).toEqual(linked);
  });

  it("reads a path-only URL, as Node's IncomingMessage gives one", () => {
    const url = `/beans/7?maple-mock=${encodeRecipe(linked)}`;
    expect(requestRecipe({ url, headers: {} })).toEqual(linked);
  });

  it.each([
    ["no cookie and no link", { url: PAGE, headers: {} }],
    ["a cleared cookie", { url: PAGE, headers: { cookie: "maple-mock=" } }],
    ["a cookie it cannot read", { url: PAGE, headers: { cookie: "maple-mock=%%%" } }],
    ["a link it cannot read", { url: `${PAGE}?maple-mock=x`, headers: { cookie: cookie(kept) } }],
  ])("is undefined for %s", (_, request) => {
    expect(requestRecipe(request)).toBeUndefined();
  });
});
