/**
 * The JSX tagger, as a Babel plugin.
 *
 * It writes the source location of every intrinsic element into the element
 * itself, so a comment left on a deployed preview names a file and a line
 * instead of a CSS selector. React 19 removed the tree-side equivalent, and a
 * preview is a production build, so there is nothing to read at runtime.
 *
 * docs/tagger.md states the four things this must never do.
 */

import { relative, sep } from "node:path";

import { formatSourceLocation, NAME_ATTRIBUTE, SOURCE_ATTRIBUTE } from "./attributes.js";
import { componentNameFor } from "./component-name.js";

import type { types as BabelTypes, ConfigAPI, NodePath, PluginPass, Visitor } from "@babel/core";

type Types = typeof BabelTypes;

/**
 * Babel 7 calls this `PluginObj` and Babel 8 `PluginObject`. The tagger runs on
 * both, so it names neither and matches the shape structurally.
 */
interface MaplePlugin {
  readonly name: string;
  readonly visitor: Visitor<PluginPass>;
}

/** How the tagger is configured. */
export interface TaggerOptions {
  /**
   * Directory the emitted paths are written relative to. Defaults to the
   * working directory, which every framework runs its build from.
   */
  readonly root?: string;
}

const INTRINSIC = /^[a-z]/;

/**
 * The Babel plugin. Both the Vite transform and the Next loader run this, so
 * the two emitters cannot drift into different behaviour.
 */
export function mapleTagger(
  api: ConfigAPI & { types: Types },
  options: TaggerOptions = {},
): MaplePlugin {
  api.assertVersion?.("^7.22.0 || ^8.0.0");
  const root = options.root ?? process.cwd();

  return {
    name: "maple-tagger",
    visitor: {
      JSXOpeningElement(path: NodePath<BabelTypes.JSXOpeningElement>, state: PluginPass) {
        tag(path, state, api.types, root);
      },
    },
  };
}

function tag(
  path: NodePath<BabelTypes.JSXOpeningElement>,
  state: PluginPass,
  types: Types,
  root: string,
): void {
  const { node } = path;
  const file = sourceFile(state.filename, root);
  if (!file || !node.loc || !isIntrinsic(node.name) || hasAttribute(node, SOURCE_ATTRIBUTE)) return;

  const source = formatSourceLocation({
    file,
    line: node.loc.start.line,
    column: node.loc.start.column + 1,
  });
  node.attributes.push(attribute(types, SOURCE_ATTRIBUTE, source));

  const name = componentNameFor(path);
  if (name && !hasAttribute(node, NAME_ATTRIBUTE)) {
    node.attributes.push(attribute(types, NAME_ATTRIBUTE, name));
  }
}

/**
 * The path to record, or undefined when this file must not be tagged at all.
 * Tagging a dependency would hand the agent a path it must not edit.
 */
function sourceFile(filename: string | null | undefined, root: string): string | undefined {
  if (!filename || filename.includes("node_modules")) return undefined;
  return relative(root, filename).split(sep).join("/");
}

/** Host elements only. A composite element's props are the component's to define. */
function isIntrinsic(name: BabelTypes.JSXOpeningElement["name"]): boolean {
  return name.type === "JSXIdentifier" && INTRINSIC.test(name.name);
}

function hasAttribute(node: BabelTypes.JSXOpeningElement, name: string): boolean {
  return node.attributes.some(
    (attr) =>
      attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" && attr.name.name === name,
  );
}

function attribute(types: Types, name: string, value: string): BabelTypes.JSXAttribute {
  return types.jsxAttribute(types.jsxIdentifier(name), types.stringLiteral(value));
}
