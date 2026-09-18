/**
 * Resolving the name a reviewer would recognise for the component a JSX element
 * is written in.
 *
 * This is deliberately a syntactic guess rather than a React-aware one. The
 * tagger runs at build time, where there is no component tree to ask, and a
 * wrong name is worse than no name: the cascade treats it as optional.
 */

import type { NodePath } from "@babel/core";

const COMPONENT = /^[A-Z]/;

/**
 * Walks up from a JSX element to the nearest enclosing declaration whose name
 * looks like a component, or returns undefined when there is none.
 */
export function componentNameFor(path: NodePath): string | undefined {
  let current = path.parentPath;
  while (current) {
    const name = nameOf(current);
    if (name) return name;
    current = current.parentPath;
  }
  return undefined;
}

function nameOf(path: NodePath): string | undefined {
  if (path.isFunctionDeclaration() || path.isClassDeclaration()) {
    return componentName(path.node.id?.name);
  }
  if (path.isArrowFunctionExpression() || path.isFunctionExpression()) {
    return componentName(assignedName(path));
  }
  return undefined;
}

/**
 * The name an anonymous function expression is assigned to, looking through
 * wrappers like `memo(...)` and `forwardRef(...)` to the declaration itself.
 */
function assignedName(path: NodePath): string | undefined {
  const declarator = path.findParent((parent) => parent.isVariableDeclarator());
  if (!declarator?.isVariableDeclarator()) return undefined;

  const { id } = declarator.node;
  return id.type === "Identifier" ? id.name : undefined;
}

function componentName(name: string | undefined): string | undefined {
  return name && COMPONENT.test(name) ? name : undefined;
}
