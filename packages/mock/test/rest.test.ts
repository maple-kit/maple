import { isJson, pathPattern, restCodec, restKey } from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

describe("pathPattern", () => {
  it.each([
    ["/", "/"],
    ["/api/projects", "/api/projects"],
    ["/api/projects/", "/api/projects"],
    ["/api/projects/42", "/api/projects/:id"],
    ["/api/projects/42/members/7", "/api/projects/:id/members/:id"],
    ["/api/users/3f2b8c1e-9d4a-4b6f-8e2d-1a2b3c4d5e6f", "/api/users/:id"],
    ["/api/runs/01ARZ3NDEKTSV4RRFFQ69G5FAV", "/api/runs/:id"],
    ["/api/commits/9fceb02d0ae598e95dc970b74767f19372d61af8", "/api/commits/:id"],
    ["/api/v2/projects", "/api/v2/projects"],
    ["/api/projects/deadbeefdeadbeef", "/api/projects/deadbeefdeadbeef"],
    ["/api/projects/atlas", "/api/projects/atlas"],
  ])("%s is %s", (path, pattern) => {
    expect(pathPattern(path)).toBe(pattern);
  });
});

describe("restKey", () => {
  it.each([
    ["GET", "https://preview.example/api/projects?page=2", "rest:GET /api/projects"],
    ["get", "https://preview.example/api/projects/42", "rest:GET /api/projects/:id"],
    ["DELETE", "https://api.example/projects/42#x", "rest:DELETE /projects/:id"],
  ])("%s %s is %s", (method, url, key) => {
    expect(restKey(method, url)).toBe(key);
  });
});

describe("isJson", () => {
  it.each([
    ["application/json", true],
    ["application/json; charset=utf-8", true],
    ["application/problem+json", true],
    ["Application/JSON", true],
    ["text/html", false],
    ["text/json-ish", false],
    [null, false],
  ])("%s → %s", (type, expected) => {
    expect(isJson(type)).toBe(expected);
  });
});

describe("restCodec", () => {
  const request = new Request("https://preview.example/api/projects/42");

  it("splits a request into one call", async () => {
    await expect(restCodec.split(request)).resolves.toEqual([
      { key: "rest:GET /api/projects/:id" },
    ]);
  });

  it("reads a JSON response", async () => {
    const response = Response.json({ id: 42 }, { status: 201 });
    await expect(restCodec.read(response, [])).resolves.toEqual([
      { kind: "data", status: 201, body: { id: 42 } },
    ]);
  });

  it.each([
    ["HTML", new Response("<p>", { headers: { "content-type": "text/html" } })],
    ["broken JSON", new Response("{", { headers: { "content-type": "application/json" } })],
  ])("does not read %s", async (_, response) => {
    await expect(restCodec.read(response, [])).resolves.toBeUndefined();
  });

  it.each([
    ["error", 500, "Internal Server Error"],
    ["forbidden", 403, "Forbidden"],
  ] as const)("joins a %s as %i", async (state, status, message) => {
    const response = restCodec.join([], [{ kind: "failure", state }]);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ message });
  });

  it("keeps the real headers, less the ones a new body invalidates", () => {
    const real = new Response("x", {
      headers: { "x-trace": "t1", "content-length": "1", "content-encoding": "gzip" },
    });
    const response = restCodec.join([], [{ kind: "data", status: 200, body: [] }], real);
    expect(response.headers.get("x-trace")).toBe("t1");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/json");
  });
});
