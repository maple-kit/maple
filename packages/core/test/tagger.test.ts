import { transformSync } from "@babel/core";
import { describe, expect, it } from "vitest";

import {
  formatSourceLocation,
  NAME_ATTRIBUTE,
  parseSourceLocation,
  SOURCE_ATTRIBUTE,
} from "../src/tagger/attributes.js";
import { mapleTagger } from "../src/tagger/babel.js";

const ROOT = "/repo";

function tag(code: string, filename = `${ROOT}/src/App.tsx`): string {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[mapleTagger, { root: ROOT }]],
  });
  return result?.code ?? "";
}

function countOf(code: string, attribute: string): number {
  return code.split(attribute).length - 1;
}

describe("the tagger", () => {
  it("writes the source location of an intrinsic element", () => {
    const output = tag(`export function Header() {\n  return <h1>Hi</h1>;\n}`);
    expect(output).toContain(`${SOURCE_ATTRIBUTE}="src/App.tsx:2:10"`);
  });

  it("names the component the element is written in", () => {
    const output = tag(`export function DashboardHeader() {\n  return <h1>Hi</h1>;\n}`);
    expect(output).toContain(`${NAME_ATTRIBUTE}="DashboardHeader"`);
  });

  it("tags every intrinsic element, not only the root", () => {
    const output = tag(`function App() {\n  return <div><span /></div>;\n}`);
    expect(countOf(output, SOURCE_ATTRIBUTE)).toBe(2);
  });

  it("leaves composite elements alone, because their props are the component's", () => {
    const output = tag(`function App() {\n  return <Button label="x" />;\n}`);
    expect(output).not.toContain(SOURCE_ATTRIBUTE);
  });

  it("does not tag a file under node_modules", () => {
    const output = tag(
      `function App() {\n  return <h1 />;\n}`,
      `${ROOT}/node_modules/ui/src/a.tsx`,
    );
    expect(output).not.toContain(SOURCE_ATTRIBUTE);
  });

  it("is idempotent, so running twice does not double the attributes", () => {
    const once = tag(`function App() {\n  return <h1 />;\n}`);
    const twice = tag(once);
    expect(countOf(twice, SOURCE_ATTRIBUTE)).toBe(1);
  });

  it("keeps a data-maple-key the application set", () => {
    const output = tag(`function App() {\n  return <li data-maple-key="msg:1" />;\n}`);
    expect(output).toContain(`data-maple-key="msg:1"`);
    expect(output).toContain(SOURCE_ATTRIBUTE);
  });

  it("writes POSIX separators for a path in a nested directory", () => {
    const output = tag(`function App() {\n  return <h1 />;\n}`, `${ROOT}/src/ui/nav/Bar.tsx`);
    expect(output).toContain(`${SOURCE_ATTRIBUTE}="src/ui/nav/Bar.tsx:2:10"`);
  });
});

describe("the component name", () => {
  const cases: ReadonlyArray<readonly [string, string, string | undefined]> = [
    ["a function declaration", `function Card() { return <h1 />; }`, "Card"],
    ["an arrow assigned to a const", `const Card = () => <h1 />;`, "Card"],
    ["a memo wrapper", `const Card = memo(() => <h1 />);`, "Card"],
    ["a forwardRef wrapper", `const Card = forwardRef((p, r) => <h1 />);`, "Card"],
    ["a class component", `class Card extends Component { render() { return <h1 />; } }`, "Card"],
    ["a callback inside a component", `const List = () => items.map(() => <li />);`, "List"],
    [
      "a lowercase helper, which is skipped for its caller",
      `function Card() { return helper(() => <h1 />); }`,
      "Card",
    ],
    ["nothing recognisable", `export default () => <h1 />;`, undefined],
    ["a lowercase function", `function render() { return <h1 />; }`, undefined],
  ];

  it.each(cases)("resolves %s", (_label, code, expected) => {
    const output = tag(code);
    if (expected === undefined) {
      expect(output).not.toContain(NAME_ATTRIBUTE);
    } else {
      expect(output).toContain(`${NAME_ATTRIBUTE}="${expected}"`);
    }
  });
});

describe("the source location format", () => {
  it("round-trips", () => {
    const location = { file: "src/App.tsx", line: 42, column: 7 };
    expect(parseSourceLocation(formatSourceLocation(location))).toEqual(location);
  });

  it("takes the last two segments, so a colon in the path survives", () => {
    expect(parseSourceLocation("src/a:b/App.tsx:42:7")).toEqual({
      file: "src/a:b/App.tsx",
      line: 42,
      column: 7,
    });
  });

  const rejected = ["", "src/App.tsx", "src/App.tsx:42", "src/App.tsx:0:7", "src/App.tsx:42:0"];

  it.each(rejected)("rejects %o", (value) => {
    expect(parseSourceLocation(value)).toBeUndefined();
  });
});
