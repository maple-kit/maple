/**
 * Where the page's LaunchDarkly SDK is pointed, in a module of its own:
 * `mock.ts` reads it before the SDK starts, and importing `flags.ts` there
 * would start the SDK before the interceptor is in place.
 */
export const LD_BASE = `${location.origin}/ld`;
