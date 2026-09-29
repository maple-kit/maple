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

/** Rules whose identity comes from a client call: the interceptor reads and rewrites its answer. */
export interface CallIdentity {
  /** The call whose answer says who the reviewer is: `rest:GET /api/session`. */
  readonly call: string;
  readonly role?: IdentityField;
  /** A list of permission names, or an object of booleans, at `path`. */
  readonly permissions?: IdentityField;
  /** Keyed by call. Under `as`, a call whose need the shown identity does not meet answers 403. */
  readonly requires?: Readonly<Record<string, CallNeed>>;
}

/** Who a server render says the reviewer really is, as the host read it from the request. */
export interface RealIdentityRead {
  readonly role?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

/**
 * Rules whose identity is rendered by the server, so no client call carries it.
 * The route asks `read` who the reviewer really is; the page is shown the
 * recipe's `as` by `displayedIdentity` in `@maple-kit/mock/server`.
 */
export interface ServerIdentity {
  /** Who the reviewer really is, or null when nobody is signed in. */
  read(request: Request): Promise<RealIdentityRead | null>;
  /** The vocabulary, since no call shape lists it. */
  readonly roles: readonly string[];
  readonly permissions?: readonly string[];
  /** Keyed by call. Under `as`, a call whose need the shown identity does not meet answers 403. */
  readonly requires?: Readonly<Record<string, CallNeed>>;
}

/** The host's rules, as it declares them in `RouteOptions.mock.identity`. */
export type IdentitySource = CallIdentity | ServerIdentity;

/** Whether the identity is rendered by the server rather than read from a call. */
export function isServerIdentity(source: IdentitySource): source is ServerIdentity {
  return "read" in source && typeof source.read === "function";
}

/** A field's words, and where the call's answer holds it: no path when the server renders it. */
export interface IdentityWords {
  readonly path?: string;
  readonly values: readonly string[];
}

/** Who the reviewer really is, as a server render said; null when nobody is signed in. */
export type CurrentIdentity = RealIdentityRead | null;

/** The rules as the page reads them, every vocabulary filled in. */
export interface IdentityRules {
  /** The identity call. Absent when the server renders the identity. */
  readonly call?: string;
  readonly role?: IdentityWords;
  readonly permissions?: IdentityWords;
  readonly requires: Readonly<Record<string, CallNeed>>;
  /** Present when the server renders the identity: who it says the reviewer really is. */
  readonly server?: { readonly current: CurrentIdentity };
}

/**
 * The rules with each vocabulary filled in: the host's words, else the shape's,
 * and every role and permission `requires` names.
 */
export function identityRules(source: CallIdentity, shape?: Shape): IdentityRules {
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

/** A server-rendered source's rules: its words plus those `requires` names, and who it read. */
export function serverIdentityRules(
  source: ServerIdentity,
  current: CurrentIdentity,
): IdentityRules {
  const requires = source.requires ?? {};
  const needs = Object.values(requires);
  const roles = [...source.roles, ...needs.flatMap((need) => need.roles ?? [])];
  const named = needs.flatMap((need) => (need.permission === undefined ? [] : [need.permission]));
  return {
    role: { values: [...new Set(roles)] },
    ...(source.permissions === undefined
      ? {}
      : { permissions: { values: [...new Set([...source.permissions, ...named])] } }),
    requires,
    server: { current },
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
  if (!isNode(value) || !isNode(value["requires"])) return false;
  const rendered = isNode(value["server"]) && isCurrent(value["server"]["current"]);
  const called = typeof value["call"] === "string";
  if (!called && !rendered) return false;
  return [value["role"], value["permissions"]].every(
    (one) =>
      one === undefined ||
      (isNode(one) &&
        (typeof one["path"] === "string" || (!called && one["path"] === undefined)) &&
        isWords(one["values"])),
  );
}

function isCurrent(value: unknown): boolean {
  if (value === null) return true;
  if (!isNode(value)) return false;
  const { permissions, role, roles } = value;
  return (
    (role === undefined || typeof role === "string") &&
    (roles === undefined || isWords(roles)) &&
    (permissions === undefined || isWords(permissions))
  );
}

function isWords(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
