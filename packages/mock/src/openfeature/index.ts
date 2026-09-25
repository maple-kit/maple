/**
 * `withMockFlags(provider)`: an OpenFeature provider that answers the flags a
 * recipe names and delegates every other one. It is typed structurally, so it
 * wraps a web or a server provider without importing either SDK, and holds a
 * provider's change events for a flag it is overriding.
 */

import { activeRecipe } from "@maple-kit/core/mock";

import { seenFlags } from "../flags.js";

import type { SeenFlag } from "../flags.js";
import type { FlagValue, Recipe } from "@maple-kit/core/mock";

/** A provider's answer, as OpenFeature types it. */
export interface Resolution<T> {
  readonly value: T;
  readonly variant?: string;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly flagMetadata?: Readonly<Record<string, boolean | number | string>>;
}

type Resolver<T> = (
  flagKey: string,
  defaultValue: T,
  context: never,
  logger: never,
) => Resolution<T> | Promise<Resolution<T>>;

/** What an event handler is told. A configuration change may name the flags it changed. */
export interface FlagEventDetails {
  readonly flagsChanged?: readonly string[];
  readonly [detail: string]: unknown;
}

type Handler = (details?: FlagEventDetails) => unknown;

/** The part of a provider's event emitter the SDK uses. */
export interface FlagEvents {
  addHandler(eventType: string, handler: Handler): void;
  removeHandler(eventType: string, handler: Handler): void;
}

/** An OpenFeature provider, web or server, as far as this adapter touches it. */
export interface FlagProvider {
  readonly metadata: { readonly name: string };
  readonly events?: FlagEvents;
  resolveBooleanEvaluation: Resolver<boolean>;
  resolveStringEvaluation: Resolver<string>;
  resolveNumberEvaluation: Resolver<number>;
  resolveObjectEvaluation: Resolver<never>;
}

/** Where the recipe comes from. */
export interface MockFlagsOptions {
  /**
   * The recipe in force. Defaults to the page's, from the installed
   * interceptor; a server passes the request's, from `requestRecipe` in `@maple-kit/mock/server`.
   */
  readonly recipe?: () => Recipe | undefined;
}

/** The `variant` an answered flag carries, so a hook or a log can tell it apart. */
export const MOCK_VARIANT = "maple-mock";

/** OpenFeature's event for a provider whose flags changed. */
const CHANGED = "PROVIDER_CONFIGURATION_CHANGED";

const METHODS = {
  resolveBooleanEvaluation: "boolean",
  resolveStringEvaluation: "string",
  resolveNumberEvaluation: "number",
  resolveObjectEvaluation: "object",
} as const;

type Method = keyof typeof METHODS;

/**
 * `provider`, answering the flags the recipe names with the recipe's values.
 * Every flag it evaluates is recorded with its real value, for the box.
 */
export function withMockFlags<P extends FlagProvider>(
  provider: P,
  options: MockFlagsOptions = {},
): P {
  const recipe = options.recipe ?? activeRecipe;
  const named = () => recipe()?.flags ?? {};
  const events = provider.events && holdEvents(provider.events, named);
  return new Proxy(provider, {
    get(target, property, receiver) {
      if (property === "events") return events;
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      if (typeof property === "string" && property in METHODS) {
        return answering(target, property as Method, named);
      }
      return (value as (...args: unknown[]) => unknown).bind(target);
    },
  });
}

function answering(
  provider: FlagProvider,
  method: Method,
  named: () => Readonly<Record<string, FlagValue>>,
) {
  const type = METHODS[method];
  const resolve = provider[method].bind(provider) as (...args: unknown[]) => unknown;
  return (flagKey: string, ...rest: unknown[]) => {
    const real = resolve(flagKey, ...rest) as
      Resolution<FlagValue> | Promise<Resolution<FlagValue>>;
    const settle = (answer: Resolution<FlagValue>) => {
      seenFlags().record(seen(flagKey, type, answer.value));
      return Object.hasOwn(named(), flagKey) ? mocked(named()[flagKey] ?? null, type) : answer;
    };
    return real instanceof Promise ? real.then(settle) : settle(real);
  };
}

function seen(key: string, type: SeenFlag["type"], value: FlagValue): SeenFlag {
  return { key, type, value };
}

/** The recipe's value, or OpenFeature's own type mismatch when it is not the type asked for. */
function mocked(value: FlagValue, type: SeenFlag["type"]): Resolution<FlagValue> {
  const fits =
    type === "object" ? typeof value === "object" && value !== null : typeof value === type;
  if (fits) return { value, variant: MOCK_VARIANT, reason: "STATIC" };
  return {
    value,
    reason: "ERROR",
    errorCode: "TYPE_MISMATCH",
    errorMessage: `The mock sets this flag to ${JSON.stringify(value)}, which is not a ${type}.`,
  };
}

/**
 * The provider's emitter, with a change to a flag the recipe names held back:
 * the page would otherwise re-read it and find it unchanged, or worse, not.
 */
function holdEvents(
  events: FlagEvents,
  named: () => Readonly<Record<string, FlagValue>>,
): FlagEvents {
  const wrapped = new WeakMap<Handler, Handler>();
  const wrap = (eventType: string, handler: Handler): Handler => {
    if (eventType !== CHANGED) return handler;
    const held: Handler = (details) => {
      const changed = details?.flagsChanged;
      if (changed === undefined || changed.length === 0) return handler(details);
      const kept = changed.filter((key) => !Object.hasOwn(named(), key));
      return kept.length === 0 ? undefined : handler({ ...details, flagsChanged: kept });
    };
    wrapped.set(handler, held);
    return held;
  };
  return new Proxy(events, {
    get(target, property, receiver) {
      if (property === "addHandler") {
        return (eventType: string, handler: Handler) => {
          target.addHandler(eventType, wrap(eventType, handler));
        };
      }
      if (property === "removeHandler") {
        return (eventType: string, handler: Handler) => {
          target.removeHandler(eventType, wrapped.get(handler) ?? handler);
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === "function" ? (value as () => unknown).bind(target) : value;
    },
  });
}
