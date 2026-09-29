import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { createSourceLocator } from "../src/anchor/locate.js";
import { createTestServer } from "./msw/server.js";

const ORIGIN = "http://app.test";
const RUNTIME =
  "    at exports.jsxDEV (http://app.test/node_modules/.vite/deps/react_jsx-dev-runtime.js:1:1)";

/** `AAAA` maps the first column of each line to the original's first; `AACA` moves down a line. */
const MAPPINGS = ["AAAA", "AACA", "AACA", "AACA"].join(";");

/** How a dev server ships a module: its code, then its map as a comment that ends the file. */
function moduleWith(map: object): string {
  const encoded = Buffer.from(JSON.stringify(map)).toString("base64");
  return `export {};\n//# sourceMappingURL=data:application/json;base64,${encoded}\n`;
}

/** An element React 19 rendered, created at `url:line:column`. */
function elementAt(url: string, line: number, column: number, owner = "TopBar"): Element {
  const stack = `Error: react-stack-top-frame\n${RUNTIME}\n    at ${owner} (${url}:${String(line)}:${String(column)})`;
  const ownerFiber = { type: { name: owner } };
  const fiber = { _debugStack: { stack }, _debugOwner: ownerFiber };
  return { __reactFiber$x: fiber } as unknown as Element;
}

const server = createTestServer();
server.listen({ onUnhandledRequest: "error" });

/** A locator whose first lookup has already started and finished its fetch. */
async function settled(
  element: Element,
  root?: string,
): Promise<ReturnType<ReturnType<typeof createSourceLocator>["locate"]>> {
  const locator = createSourceLocator({ ...(root === undefined ? {} : { root }) });
  locator.locate(element);
  await vi
    .waitFor(
      () => {
        // The fetch is asynchronous; a second ask answers once it lands.
        if (locator.locate(element) === undefined) throw new Error("not yet");
      },
      { timeout: 300 },
    )
    .catch(() => undefined);
  return locator.locate(element);
}

describe("createSourceLocator", () => {
  it("answers nothing on the first ask and the location once the map has loaded", async () => {
    server.use(
      http.get(`${ORIGIN}/src/App.tsx`, () =>
        HttpResponse.text(
          moduleWith({
            version: 3,
            sources: ["App.tsx"],
            file: "/work/app/src/App.tsx",
            mappings: MAPPINGS,
          }),
        ),
      ),
    );
    const element = elementAt(`${ORIGIN}/src/App.tsx`, 3, 8);
    const locator = createSourceLocator({ root: "/work/app" });

    expect(locator.locate(element)).toBeUndefined();
    await vi.waitFor(() => {
      expect(locator.locate(element)).toEqual({ source: "src/App.tsx:3:1", component: "TopBar" });
    });
  });

  it.each([
    [
      "resolves a Vite map through the absolute path it records",
      { file: "/work/app/src/App.tsx", sources: ["App.tsx"] },
      "/work/app",
      "src/App.tsx:3:1",
    ],
    [
      "keeps the absolute path when the map is from outside the root",
      { file: "/work/app/src/App.tsx", sources: ["App.tsx"] },
      "/elsewhere",
      "/work/app/src/App.tsx:3:1",
    ],
    [
      "reads a Turbopack path",
      { sources: ["turbopack:///[project]/app/page.tsx"] },
      undefined,
      "app/page.tsx:3:1",
    ],
    [
      "reads a webpack path",
      { sources: ["webpack://site/./app/page.tsx"] },
      undefined,
      "app/page.tsx:3:1",
    ],
    [
      "falls back to the served path where a map names no file",
      { sources: ["App.tsx"] },
      undefined,
      "src/App.tsx:3:1",
    ],
  ] as const)("%s", async (_name, extra, root, expected) => {
    server.use(
      http.get(`${ORIGIN}/src/App.tsx`, () =>
        HttpResponse.text(moduleWith({ version: 3, mappings: MAPPINGS, ...extra })),
      ),
    );

    const found = await settled(elementAt(`${ORIGIN}/src/App.tsx`, 3, 8), root);

    expect(found?.source).toBe(expected);
  });

  it("follows an external map", async () => {
    server.use(
      http.get(`${ORIGIN}/chunk.js`, () =>
        HttpResponse.text("export {};\n//# sourceMappingURL=chunk.js.map\n"),
      ),
      http.get(`${ORIGIN}/chunk.js.map`, () =>
        HttpResponse.json({
          version: 3,
          sources: ["turbopack:///[project]/a.tsx"],
          mappings: MAPPINGS,
        }),
      ),
    );

    const found = await settled(elementAt(`${ORIGIN}/chunk.js`, 2, 4));

    expect(found?.source).toBe("a.tsx:2:1");
  });

  it("skips a library and answers with the application code that used it", async () => {
    server.use(
      http.get(`${ORIGIN}/lib.js`, () =>
        HttpResponse.text(
          moduleWith({
            version: 3,
            sources: ["/work/node_modules/ui/button.js"],
            mappings: MAPPINGS,
          }),
        ),
      ),
    );

    expect(await settled(elementAt(`${ORIGIN}/lib.js`, 1, 1))).toBeUndefined();
  });

  it.each([
    ["a server error", () => new HttpResponse(null, { status: 500 })],
    ["a module with no map", () => HttpResponse.text("export {};")],
    [
      "a map that is not JSON",
      () => HttpResponse.text("export {};\n//# sourceMappingURL=data:application/json,%7Bnope\n"),
    ],
  ] as const)("answers nothing for %s", async (_name, respond) => {
    server.use(http.get(`${ORIGIN}/src/App.tsx`, respond));

    expect(await settled(elementAt(`${ORIGIN}/src/App.tsx`, 3, 8))).toBeUndefined();
  });

  it("answers nothing for an element that is not React's", () => {
    const locator = createSourceLocator();

    expect(locator.locate({} as Element)).toBeUndefined();
  });
});
