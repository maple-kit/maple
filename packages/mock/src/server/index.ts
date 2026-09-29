/**
 * The recipe on the server, for flags and `as` evaluated there: read from a
 * request's `?maple-mock=` link, else from the cookie the page keeps. It is
 * opt-in, from the host's own session loader, and loads no MSW.
 */

import { decodeRecipe, readRecipeCookie, RECIPE_PARAM } from "@maple-kit/core/mock";

import type { Recipe } from "@maple-kit/core/mock";

/** A request, as a server framework hands one over. */
export interface RecipeRequest {
  readonly url: string;
  readonly headers: Headers | Readonly<Record<string, string | readonly string[] | undefined>>;
}

/**
 * The recipe a request carries, or undefined when it carries none or one that
 * cannot be read. The recipe's `route` is not checked here: an API call made
 * for a page has the API's path, not the page's.
 */
export function requestRecipe(request: RecipeRequest): Recipe | undefined {
  try {
    const linked = new URL(request.url, "http://localhost").searchParams.get(RECIPE_PARAM);
    if (linked !== null) return decodeRecipe(linked);
    return readRecipeCookie(cookieOf(request.headers));
  } catch {
    return undefined;
  }
}

function cookieOf(headers: RecipeRequest["headers"]): string | undefined {
  if (headers instanceof Headers) return headers.get("cookie") ?? undefined;
  const value = headers["cookie"];
  return Array.isArray(value) ? value.join("; ") : (value as string | undefined);
}

/** The fields of the identity a host renders that a recipe's `as` may change. */
export interface DisplayedFields {
  readonly role?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

/** What {@link displayedIdentity} needs: the preview switch and the rules' words. */
export interface DisplayOptions {
  /** The same switch as `RouteOptions.mock.preview`. False, `real` comes back unchanged. */
  readonly preview: boolean;
  /** A role the recipe names that is not listed here is ignored. */
  readonly roles: readonly string[];
  /** When given, a permission the recipe names that is not listed here is ignored. */
  readonly permissions?: readonly string[];
}

/**
 * The identity to DISPLAY: the recipe's `as` applied to the identity the host
 * already read, in a preview only, and for the roles and permissions listed.
 * With no recipe, no `as`, a build that is not a preview, or a role the rules do
 * not list, `real` comes back as it is.
 *
 * Presentation only. Render with the result and seed the client with it; never
 * use it to authorise anything. Procedures, queries and backend calls keep
 * checking the real session, so `as` changes what a reviewer sees and never
 * what they may do.
 */
export function displayedIdentity<T extends DisplayedFields>(
  request: RecipeRequest,
  real: T,
  options: DisplayOptions,
): T;
export function displayedIdentity<T extends DisplayedFields>(
  request: RecipeRequest,
  real: T | null,
  options: DisplayOptions,
): T | null;
export function displayedIdentity<T extends DisplayedFields>(
  request: RecipeRequest,
  real: T | null,
  options: DisplayOptions,
): T | null {
  const as = options.preview && real !== null ? requestRecipe(request)?.as : undefined;
  if (as === undefined || real === null) return real;
  const role = as.role !== undefined && options.roles.includes(as.role) ? as.role : undefined;
  const changes = Object.entries(as.permissions ?? {}).filter(
    ([name]) => options.permissions === undefined || options.permissions.includes(name),
  );
  if (role === undefined && changes.length === 0) return real;
  return {
    ...real,
    ...(role === undefined ? {} : withRole(real, role)),
    ...(changes.length === 0 ? {} : { permissions: withPermissions(real.permissions, changes) }),
  };
}

/** The role field the host renders: `roles` when it has them, and `role` when it has that or neither. */
function withRole(real: DisplayedFields, role: string): DisplayedFields {
  const hasRoles = real.roles !== undefined;
  return {
    ...(hasRoles ? { roles: [role] } : {}),
    ...(hasRoles && real.role === undefined ? {} : { role }),
  };
}

function withPermissions(
  held: readonly string[] | undefined,
  changes: readonly (readonly [string, boolean])[],
): readonly string[] {
  const kept = (held ?? []).filter((name) =>
    changes.every(([n, granted]) => n !== name || granted),
  );
  const added = changes.filter(([name, granted]) => granted && !kept.includes(name));
  return [...kept, ...added.map(([name]) => name)];
}
