/**
 * The recipe: what a mock changes, as a small serialisable record.
 *
 * It is a wire format between packages. `@maple-kit/mock` reads it to rewrite
 * responses, and the comment fence will carry it, so writer and reader share
 * this one validator. `docs/mock.md` records why it has this shape.
 */

/**
 * The recipe format this build writes and the newest it reads. Version 1, the
 * same record without `flags` and `as`, is still read.
 */
export const RECIPE_VERSION = 2;

/**
 * Every state a call can be put in, in the order a box lists them. A new
 * state is appended, so the order an older list and a tie-break read holds.
 */
export const MOCK_STATES = [
  "empty",
  "error",
  "forbidden",
  "loading",
  "one",
  "many",
  "long",
  "sparse",
  "mixed",
] as const;

/** A state a call can be put in. */
export type MockState = (typeof MOCK_STATES)[number];

/** One logical call and the state its response is rewritten into. */
export interface MockCall {
  /**
   * The call's stable key, prefixed by the codec that owns its grammar:
   * `rest:GET /api/projects/:id`, `trpc:project.list`.
   */
  readonly key: string;
  readonly state: MockState;
}

/** A value a flag can be set to: any JSON value. */
export type FlagValue =
  boolean | number | string | null | readonly FlagValue[] | { readonly [key: string]: FlagValue };

/**
 * Who the page is told the reviewer is. Both halves are the host's vocabulary,
 * never Maple's: a role from its schema, and permissions granted (`true`) or
 * taken away (`false`) beside the ones the reviewer really has.
 */
export interface MockIdentity {
  readonly role?: string;
  readonly permissions?: Readonly<Record<string, boolean>>;
}

/** A mock, as it is stored, linked and carried in a comment. */
export interface Recipe {
  readonly version: typeof RECIPE_VERSION;
  /** Calls to rewrite. A call not named here passes through untouched. */
  readonly calls: readonly MockCall[];
  /** Flags answered with these values. A flag not named keeps its real value. */
  readonly flags?: Readonly<Record<string, FlagValue>>;
  /** Who the page is told the reviewer is. The server still acts as them. */
  readonly as?: MockIdentity;
  /**
   * The route pattern it applies on, such as `/projects/:id`. Absent, it
   * applies on every route the tab visits.
   */
  readonly route?: string;
  /** The words the reviewer typed, when a sentence produced the recipe. */
  readonly request?: string;
}

/** Raised when a value is not a recipe this build can read. */
export class InvalidRecipeError extends Error {
  override readonly name = "InvalidRecipeError";

  constructor(readonly issues: readonly string[]) {
    super(["Invalid mock recipe:", ...issues].join("\n  "));
  }
}

const KEY = /^[a-z]+:\S/;
const STATES: ReadonlySet<string> = new Set(MOCK_STATES);

/**
 * Validates `input` as a recipe and returns a fresh copy of it.
 *
 * Unknown fields are dropped rather than refused, so a later layer can be added
 * without an older reader rejecting the whole recipe. A newer `version` is
 * refused, because half-reading a format is how a mock applies the wrong thing.
 *
 * @throws {InvalidRecipeError} listing every problem found.
 */
export function parseRecipe(input: unknown): Recipe {
  if (!isRecord(input)) throw new InvalidRecipeError(["a recipe is an object"]);

  const issues = [...versionIssues(input["version"])];
  const calls = parseCalls(input["calls"], issues);
  const flags = parseFlags(input["flags"], issues);
  const as = parseIdentity(input["as"], issues);
  const { request, route } = input;
  if (request !== undefined && typeof request !== "string") {
    issues.push("request: must be a string when present");
  }
  if (route !== undefined && !(typeof route === "string" && route.startsWith("/"))) {
    issues.push('route: must be a path pattern starting with "/" when present');
  }
  if (issues.length > 0) throw new InvalidRecipeError(issues);

  return {
    version: RECIPE_VERSION,
    calls,
    ...(flags === undefined ? {} : { flags }),
    ...(as === undefined ? {} : { as }),
    ...(typeof route === "string" ? { route } : {}),
    ...(typeof request === "string" ? { request } : {}),
  };
}

function versionIssues(version: unknown): string[] {
  if (version === 1 || version === RECIPE_VERSION) return [];
  if (typeof version === "number" && version > RECIPE_VERSION) {
    return [`version: ${version} is newer than this build reads (${RECIPE_VERSION})`];
  }
  return [`version: must be 1 or ${RECIPE_VERSION}`];
}

function parseFlags(value: unknown, issues: string[]): Record<string, FlagValue> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push("flags: must be an object of flag keys when present");
    return undefined;
  }
  const flags: Record<string, FlagValue> = {};
  for (const [key, flag] of Object.entries(value)) {
    if (key.trim() === "") issues.push("flags: a flag key must not be blank");
    else if (isFlagValue(flag)) flags[key] = structuredClone(flag);
    else issues.push(`flags.${key}: must be a JSON value`);
  }
  return flags;
}

function isFlagValue(value: unknown): value is FlagValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isFlagValue);
  return isRecord(value) && Object.values(value).every(isFlagValue);
}

function parseIdentity(value: unknown, issues: string[]): MockIdentity | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push("as: must be an object when present");
    return undefined;
  }
  const { role, permissions } = value;
  if (role === undefined && permissions === undefined) {
    issues.push("as: must name a role, permissions, or both");
  }
  const validRole = typeof role === "string" && role.trim() !== "";
  if (role !== undefined && !validRole) issues.push("as.role: must be a non-blank string");
  const granted = parsePermissions(permissions, issues);
  return {
    ...(validRole ? { role } : {}),
    ...(granted === undefined ? {} : { permissions: granted }),
  };
}

function parsePermissions(value: unknown, issues: string[]): Record<string, boolean> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push("as.permissions: must map each permission to true or false");
    return undefined;
  }
  const permissions: Record<string, boolean> = {};
  for (const [key, granted] of Object.entries(value)) {
    if (key.trim() === "") issues.push("as.permissions: a permission must not be blank");
    else if (typeof granted === "boolean") permissions[key] = granted;
    else issues.push(`as.permissions.${key}: must be true or false`);
  }
  return permissions;
}

/**
 * Who a recipe tells the page the reviewer is, in words: `admin, without
 * billing:write`. Undefined when the recipe does not say.
 */
export function describeIdentity(as: MockIdentity | undefined): string | undefined {
  if (as === undefined) return undefined;
  const permissions = Object.entries(as.permissions ?? {}).map(
    ([permission, granted]) => `${granted ? "with" : "without"} ${permission}`,
  );
  const words = [...(as.role === undefined ? [] : [as.role]), ...permissions];
  return words.length === 0 ? undefined : words.join(", ");
}

function parseCalls(value: unknown, issues: string[]): MockCall[] {
  if (!Array.isArray(value)) {
    issues.push("calls: must be an array");
    return [];
  }
  const seen = new Set<string>();
  const calls: MockCall[] = [];
  value.forEach((entry: unknown, index) => {
    const call = parseCall(entry, `calls.${index}`, issues);
    if (call === undefined) return;
    if (seen.has(call.key)) issues.push(`calls.${index}.key: "${call.key}" appears twice`);
    seen.add(call.key);
    calls.push(call);
  });
  return calls;
}

function parseCall(entry: unknown, path: string, issues: string[]): MockCall | undefined {
  if (!isRecord(entry)) {
    issues.push(`${path}: must be an object`);
    return undefined;
  }
  const { key, state } = entry;
  const validKey = typeof key === "string" && KEY.test(key);
  const validState = typeof state === "string" && STATES.has(state);
  if (!validKey) issues.push(`${path}.key: must look like "codec:name"`);
  if (!validState) issues.push(`${path}.state: must be one of ${MOCK_STATES.join(", ")}`);
  return validKey && validState ? { key, state: state as MockState } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
