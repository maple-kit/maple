/**
 * A recipe's `as`, applied: the identity call's answer tells the page the
 * role and permissions the recipe names, and a call whose need that identity
 * does not meet answers 403. The server still acts as the reviewer.
 */

import type { IdentityRules, MockIdentity } from "@maple-kit/core/mock";

/** Who the reviewer really is, as the identity call last answered. */
export interface RealIdentity {
  readonly role?: string;
  readonly permissions?: ReadonlySet<string>;
}

/** Reads the real role and permissions out of the identity call's answer. */
export function realIdentity(body: unknown, rules: IdentityRules): RealIdentity {
  const role = rules.role && valueAt(body, rules.role.path);
  const held = rules.permissions && valueAt(body, rules.permissions.path);
  const permissions = granted(held);
  return {
    ...(typeof role === "string" ? { role } : {}),
    ...(permissions === undefined ? {} : { permissions }),
  };
}

/**
 * Whether the identity the page is shown meets `key`'s need. True for a call
 * nothing requires, and for a need that cannot be judged: the server decides.
 */
export function meetsNeed(
  key: string,
  as: MockIdentity,
  rules: IdentityRules,
  real: RealIdentity,
): boolean {
  const need = rules.requires[key];
  if (need === undefined) return true;
  const role = as.role ?? real.role;
  const roleMet = need.roles === undefined || role === undefined || need.roles.includes(role);
  const permission = need.permission;
  const shown = permission === undefined ? undefined : shownPermission(permission, as, real);
  return roleMet && shown !== false;
}

function shownPermission(permission: string, as: MockIdentity, real: RealIdentity) {
  return as.permissions?.[permission] ?? real.permissions?.has(permission);
}

/**
 * The identity call's answer with the recipe's role and permissions written
 * in. A role outside the rules' words is left as the server said it.
 */
export function impose(body: unknown, as: MockIdentity, rules: IdentityRules): unknown {
  const copy = structuredClone(body);
  const { permissions, role } = rules;
  if (as.role !== undefined && role !== undefined && knows(role.values, as.role)) {
    setAt(copy, role.path, as.role);
  }
  if (as.permissions !== undefined && permissions !== undefined) {
    const held = valueAt(copy, permissions.path);
    const next = rewritten(held, as.permissions);
    if (next !== held) setAt(copy, permissions.path, next);
  }
  return copy;
}

/** Whether a role is one the page can be shown: any, when nothing lists them. */
export function knows(values: readonly string[], role: string): boolean {
  return values.length === 0 || values.includes(role);
}

/** A permission list or object with the recipe's grants and removals applied. */
function rewritten(held: unknown, changes: Readonly<Record<string, boolean>>): unknown {
  if (Array.isArray(held)) {
    const kept = (held as unknown[]).filter(
      (name) => typeof name !== "string" || changes[name] !== false,
    );
    const added = Object.keys(changes).filter((name) => changes[name] && !kept.includes(name));
    return [...kept, ...added];
  }
  if (isRecord(held)) return { ...held, ...changes };
  return held;
}

/** The permissions a list names, or an object sets true. */
function granted(held: unknown): ReadonlySet<string> | undefined {
  if (Array.isArray(held)) {
    return new Set((held as unknown[]).filter((name): name is string => typeof name === "string"));
  }
  if (!isRecord(held)) return undefined;
  return new Set(Object.keys(held).filter((name) => held[name] === true));
}

function valueAt(body: unknown, path: string): unknown {
  let at: unknown = body;
  for (const segment of path.split(".")) at = isRecord(at) ? at[segment] : undefined;
  return at;
}

/** Writes `value` at a dotted path whose parents exist; a missing parent writes nothing. */
function setAt(body: unknown, path: string, value: unknown): void {
  const segments = path.split(".");
  const last = segments.pop();
  let at: unknown = body;
  for (const segment of segments) at = isRecord(at) ? at[segment] : undefined;
  if (last !== undefined && isRecord(at)) at[last] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
