/**
 * The recipe in force on the page, read without importing the interceptor:
 * `@maple-kit/mock` leaves its handle under {@link MOCK_HANDLE_KEY}, and a
 * comment written under a mock records what the page was showing.
 */

import { parseRecipe } from "./recipe.js";

import type { Recipe } from "./recipe.js";

/** Where `installMock` leaves its handle on `globalThis`. */
export const MOCK_HANDLE_KEY = Symbol.for("@maple-kit/mock.installed");

/**
 * The recipe applying on the page now, or undefined with no mock on. A handle
 * that answers something unreadable is treated as no mock, never an error.
 */
export function activeRecipe(): Recipe | undefined {
  const handle = (globalThis as Record<symbol, unknown>)[MOCK_HANDLE_KEY];
  if (typeof handle !== "object" || handle === null) return undefined;
  const current = (handle as { current?: unknown }).current;
  if (typeof current !== "function") return undefined;
  try {
    const recipe: unknown = current.call(handle);
    return recipe === undefined ? undefined : parseRecipe(recipe);
  } catch {
    return undefined;
  }
}
