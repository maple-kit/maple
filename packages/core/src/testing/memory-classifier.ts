/**
 * A classifier connector that answers from its options and remembers what it
 * was asked.
 *
 * It exists so the contract suite has a reference to run against, and so a
 * test can drive the assist path without a model. Nothing here judges
 * anything: the answer is whatever the options said it would be.
 */

import {
  DEFAULT_PILLARS,
  kindFromWeights,
  scoreAtPosition,
  selectPillars,
} from "../connectors/classifier.js";
import { flagValues, plannedCall, plannedFlag, stateFromWeights } from "../connectors/plan.js";

import type {
  ClassifierConnector,
  ClassifierRequest,
  CommentKind,
  KindGuess,
  MockPlan,
  MockPlanFlag,
  MockPlanRequest,
  MockPlanState,
  Pillar,
  PillarScore,
  PlannedFlag,
  ScoreRequest,
} from "../connectors/types.js";
import type { FlagValue } from "../mock/recipe.js";

/** Options for {@link memoryClassifier}. */
export interface MemoryClassifierOptions {
  /** Connector name reported to Maple. Defaults to `"memory"`. */
  readonly name?: string;
  /** The pillars it scores. Defaults to {@link DEFAULT_PILLARS}. */
  readonly pillars?: readonly Pillar[];
  /** Where on every pillar a comment lands, from 0 to 1. Defaults to the middle. */
  readonly at?: number;
  /** The kind every comment is classified as. Defaults to `"other"`. */
  readonly kind?: CommentKind;
  /** The state every sentence is planned as. Defaults to `"none"`. */
  readonly state?: MockPlanState;
  /** The call keys every plan concerns. Defaults to every call it is given. */
  readonly concerns?: readonly string[];
  /** Flags every plan sets, by key, when the request lists them. Defaults to none. */
  readonly planFlags?: Readonly<Record<string, FlagValue>>;
  /** The role every plan names, when the request lists it. Defaults to none. */
  readonly planRole?: string;
  /** Which methods to define, to exercise a partly capable connector. Defaults to all. */
  readonly methods?: readonly ("classify" | "plan" | "score")[];
}

/** A classifier connector plus the history a test asserts on. */
export interface MemoryClassifier extends ClassifierConnector {
  /** Every body or mock request it was asked about, oldest first. */
  asked(): readonly string[];
  /** Forgets everything, so one test cannot see another's. */
  reset(): void;
}

/** Creates an in-memory classifier connector. */
export function memoryClassifier(options: MemoryClassifierOptions = {}): MemoryClassifier {
  const methods = options.methods ?? ["score", "classify", "plan"];
  const at = options.at ?? 0.5;
  const bodies: string[] = [];

  const connector: MemoryClassifier = {
    name: options.name ?? "memory",
    pillars: options.pillars ?? DEFAULT_PILLARS,
    asked: () => [...bodies],
    reset: () => {
      bodies.length = 0;
    },
  };

  if (methods.includes("score")) {
    connector.score = (request: ScoreRequest): Promise<readonly PillarScore[]> => {
      bodies.push(request.body);

      try {
        const wanted = selectPillars(connector, request.pillars);
        return Promise.resolve(wanted.map((pillar) => scoreAtPosition(pillar, at)));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }

  if (methods.includes("classify")) {
    connector.classify = (request: ClassifierRequest): Promise<KindGuess> => {
      bodies.push(request.body);

      return Promise.resolve(kindFromWeights({ [options.kind ?? "other"]: 2 }));
    };
  }

  if (methods.includes("plan")) {
    connector.plan = (request: MockPlanRequest): Promise<MockPlan> => {
      bodies.push(request.request);
      const state = options.state ?? "none";
      const concerned = (key: string): boolean => options.concerns?.includes(key) ?? true;

      const role = options.planRole;
      return Promise.resolve({
        ...stateFromWeights(state === "none" ? {} : { [state]: 2 }),
        calls: request.calls.map((call) => plannedCall(call.key, concerned(call.key) ? 1 : 0)),
        ...(request.flags === undefined ? {} : { flags: request.flags.map(flagVerdict) }),
        ...(role !== undefined && request.roles?.includes(role) ? { role: { role, p: 1 } } : {}),
      });
    };
  }

  /** The flag's set value when the options name it, else a verdict that it is not meant. */
  function flagVerdict(flag: MockPlanFlag): PlannedFlag {
    const set = options.planFlags?.[flag.key];
    if (set !== undefined) return plannedFlag(flag.key, set, 1);
    return plannedFlag(flag.key, flagValues(flag)[0] ?? null, 0);
  }

  return connector;
}
