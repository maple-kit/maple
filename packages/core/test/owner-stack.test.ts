import { describe, expect, it } from "vitest";

import { creationFrame, ownerFrames } from "../src/anchor/owner-stack.js";

const CHROMIUM = [
  "Error: react-stack-top-frame",
  "    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:197:25)",
  "    at TopBar (http://localhost:5173/src/app/components.tsx:883:25)",
  "    at Object.react_stack_bottom_frame (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=2:14142:12)",
].join("\n");

const FIREFOX = [
  "jsxDEV@http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:197:25",
  "TopBar@http://localhost:5173/src/app/components.tsx:883:25",
  "react_stack_bottom_frame@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=2:14142:12",
].join("\n");

const NO_NAME = [
  "Error: react-stack-top-frame",
  "    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:197:25)",
  "    at http://localhost:5173/src/main.tsx:12:5",
].join("\n");

const ELSEWHERE = { url: "http://localhost:5173/src/app/components.tsx", line: 883, column: 25 };

describe("creationFrame", () => {
  it.each([
    ["Chromium", CHROMIUM, ELSEWHERE],
    ["Firefox and Safari", FIREFOX, ELSEWHERE],
    [
      "a frame with no function name",
      NO_NAME,
      { url: "http://localhost:5173/src/main.tsx", line: 12, column: 5 },
    ],
    [
      "an ordinary error",
      "Error: boom\n    at run (http://localhost:5173/src/a.ts:1:2)",
      undefined,
    ],
    [
      "React's frames and nothing below them",
      CHROMIUM.split("\n").slice(0, 2).join("\n"),
      undefined,
    ],
    ["an empty stack", "", undefined],
  ] as const)("reads %s", (_name, stack, expected) => {
    expect(creationFrame(stack)).toEqual(expected);
  });
});

/** An element with the fibers React 19 attaches in development, owner chain included. */
function elementWith(...stacks: readonly (readonly [stack: string, owner: string | undefined])[]) {
  interface Fiber {
    _debugStack?: { stack: string };
    _debugOwner: Fiber | null;
    type?: { displayName: string };
  }
  const fibers: Fiber[] = stacks.map(([stack]) => ({ _debugStack: { stack }, _debugOwner: null }));
  stacks.forEach(([, owner], index) => {
    if (owner === undefined) return;
    // The owner is the component's own fiber; the last one's has no stack of its own.
    const above = fibers[index + 1] ?? { _debugOwner: null };
    above.type = { displayName: owner };
    fibers[index]!._debugOwner = above;
    if (index + 1 === fibers.length) fibers.push(above);
  });
  stacks.forEach((_, index) => {
    fibers[index]!._debugOwner ??= fibers[index + 1] ?? null;
  });
  return { __reactFiber$abc: fibers[0] } as unknown as Element;
}

describe("ownerFrames", () => {
  it("answers nothing for an element React did not render", () => {
    expect(ownerFrames({} as Element)).toEqual([]);
  });

  it("names the component that rendered each frame, nearest first", () => {
    const element = elementWith([CHROMIUM, "TopBar"], [NO_NAME, "Shell"], [CHROMIUM, undefined]);

    expect(ownerFrames(element).map((frame) => frame.component)).toEqual([
      "TopBar",
      "Shell",
      undefined,
    ]);
  });

  it("skips a fiber whose stack is not one React wrote", () => {
    const element = elementWith(["Error: boom", "Shell"], [NO_NAME, undefined]);

    expect(ownerFrames(element)).toHaveLength(1);
  });
});
