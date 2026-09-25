/**
 * The recipe: what a mock changes, as a small serialisable record.
 *
 * It is a wire format between packages. `@maple-kit/mock` reads it to rewrite
 * responses, and the comment fence will carry it, so writer and reader share
 * this one validator. `docs/mock.md` records why it has this shape.
 */

/** The recipe format this build writes and the newest it reads. */
export const RECIPE_VERSION = 1;

/** Every state a call can be put in, in the order a box lists them. */
export const MOCK_STATES = ["empty", "error", "forbidden", "loading", "one", "many"] as const;

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

/** A mock, as it is stored, linked and carried in a comment. */
export interface Recipe {
  readonly version: typeof RECIPE_VERSION;
  /** Calls to rewrite. A call not named here passes through untouched. */
  readonly calls: readonly MockCall[];
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
  const request = input["request"];
  if (request !== undefined && typeof request !== "string") {
    issues.push("request: must be a string when present");
  }
  if (issues.length > 0) throw new InvalidRecipeError(issues);

  return {
    version: RECIPE_VERSION,
    calls,
    ...(typeof request === "string" ? { request } : {}),
  };
}

function versionIssues(version: unknown): string[] {
  if (version === RECIPE_VERSION) return [];
  if (typeof version === "number" && version > RECIPE_VERSION) {
    return [`version: ${version} is newer than this build reads (${RECIPE_VERSION})`];
  }
  return [`version: must be ${RECIPE_VERSION}`];
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
