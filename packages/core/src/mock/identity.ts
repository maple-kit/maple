/**
 * Where a page learns who its reviewer is, and what each call needs: the
 * host's rules for a recipe's `as`. The host names the call and the fields;
 * Maple never guesses which of a page's fields carries authorisation.
 */

import { isNode, resolved } from "./pointer.js";

import type { SchemaNode } from "./pointer.js";
import type { JsonSchema, Shape } from "./shape.js";

/** What a call needs of the identity the page is shown. Either half is enough to refuse it. */
export interface CallNeed {
  /** Any one of these roles. */
  readonly roles?: readonly string[];
  /** This permission, granted. */
  readonly permission?: string;
}

/** One field of the identity call's answer, and the words it may hold. */
export interface IdentityField {
  /** A dotted path into the call's answer: `role`, `user.role`. */
  readonly path: string;
  /** Absent, read from the call's shape: a role's enum, a list's item enum, an object's keys. */
  readonly values?: readonly string[];
}

/** The host's rules, as it declares them in `RouteOptions.mock.identity`. */
export interface IdentitySource {
  /** The call whose answer says who the reviewer is: `rest:GET /api/session`. */
  readonly call: string;
  readonly role?: IdentityField;
  /** A list of permission names, or an object of booleans, at `path`. */
  readonly permissions?: IdentityField;
  /** Keyed by call. Under `as`, a call whose need the shown identity does not meet answers 403. */
  readonly requires?: Readonly<Record<string, CallNeed>>;
}

/** The rules as the page reads them, every vocabulary filled in. */
export interface IdentityRules {
  readonly call: string;
  readonly role?: Required<IdentityField>;
  readonly permissions?: Required<IdentityField>;
  readonly requires: Readonly<Record<string, CallNeed>>;
}

/**
 * The rules with each vocabulary filled in: the host's words, else the shape's,
 * and every role and permission `requires` names.
 */
export function identityRules(source: IdentitySource, shape?: Shape): IdentityRules {
  const requires = source.requires ?? {};
  const needs = Object.values(requires);
  const role =
    source.role &&
    field(
      source.role,
      shape,
      roleWords,
      needs.flatMap((need) => need.roles ?? []),
    );
  const permissions =
    source.permissions &&
    field(
      source.permissions,
      shape,
      permissionWords,
      needs.flatMap((need) => (need.permission === undefined ? [] : [need.permission])),
    );
  return {
    call: source.call,
    ...(role ? { role } : {}),
    ...(permissions ? { permissions } : {}),
    requires,
  };
}

type Words = (root: JsonSchema, node: unknown) => string[];

function field(
  declared: IdentityField,
  shape: Shape | undefined,
  words: Words,
  named: readonly string[],
): Required<IdentityField> {
  const found =
    declared.values ??
    (shape === undefined ? [] : words(shape.schema, at(shape.schema, declared.path)));
  return { path: declared.path, values: [...new Set([...found, ...named])] };
}

/** The schema of the field at a dotted path, through `$ref`s and a nullable union. */
function at(root: JsonSchema, path: string): unknown {
  let node: unknown = root;
  for (const segment of path.split(".")) {
    const properties = objectOf(root, node)?.["properties"];
    node = isNode(properties) ? properties[segment] : undefined;
  }
  return node;
}

/** The object a node describes: itself, or the one branch of a union that is an object. */
function objectOf(root: JsonSchema, node: unknown): SchemaNode | undefined {
  const here = resolved(root, node).here;
  if (here === undefined || isNode(here["properties"])) return here;
  const branches = [here["anyOf"], here["oneOf"], here["allOf"]].flatMap((list): unknown[] =>
    Array.isArray(list) ? (list as unknown[]) : [],
  );
  return branches
    .map((branch) => resolved(root, branch).here)
    .find((b) => isNode(b?.["properties"]));
}

function roleWords(root: JsonSchema, node: unknown): string[] {
  const here = resolved(root, node).here;
  return strings(here?.["enum"] ?? (typeof here?.["const"] === "string" ? [here["const"]] : []));
}

/** A list's item enum, or an object's property names. */
function permissionWords(root: JsonSchema, node: unknown): string[] {
  const here = resolved(root, node).here;
  if (here?.["items"] !== undefined) return roleWords(root, here["items"]);
  const properties = objectOf(root, node)?.["properties"];
  return isNode(properties) ? Object.keys(properties) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Whether `value` is identity rules as the route writes them. */
export function isIdentityRules(value: unknown): value is IdentityRules {
  if (!isNode(value) || typeof value["call"] !== "string" || !isNode(value["requires"])) {
    return false;
  }
  return [value["role"], value["permissions"]].every(
    (one) =>
      one === undefined ||
      (isNode(one) && typeof one["path"] === "string" && isWords(one["values"])),
  );
}

function isWords(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
