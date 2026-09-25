/**
 * A plan's flags and role, in jev's vocabulary: each listed flag a `choice`
 * over its values and leaving it alone, the role a `choice` over the listed
 * roles and naming none. They are asked in a request of their own, so the
 * state and the calls are judged exactly as they are without them.
 */

import { flagValues, plannedFlag } from "@maple-kit/core/connectors";

import type { Answer, ChoiceQuestion, Json, Question } from "./questions.js";
import type {
  MockPlan,
  MockPlanFlag,
  MockPlanRequest,
  PlannedFlag,
  PlannedRole,
} from "@maple-kit/core/connectors";
import type { FlagValue } from "@maple-kit/core/mock";

/** The key one flag is asked about under: its index, since a key is any text. */
export function flagKey(index: number): string {
  return `flag:${index}`;
}

/** The key the role is asked and answered under. */
export const ROLE_KEY = "role";

/** Whether a request lists anything a second question set would ask about. */
export function hasLayers(request: MockPlanRequest): boolean {
  return (request.flags?.length ?? 0) > 0 || (request.roles?.length ?? 0) > 0;
}

/** The layers request's `state`: the sentence, and every flag's values and the roles. */
export function layerStateFor(request: MockPlanRequest): { readonly [key: string]: Json } {
  return {
    request: request.request,
    route: request.route,
    flags: (request.flags ?? []).map((flag) => ({
      key: flag.key,
      values: flagValues(flag).map(valueLabel),
    })),
    roles: [...(request.roles ?? [])],
  };
}

/** One question per listed flag, and one for the role where roles are listed. */
export function layerQuestions(request: MockPlanRequest): Record<string, Question> {
  const questions: Record<string, Question> = {};
  request.flags?.forEach((flag, index) => {
    questions[flagKey(index)] = flagQuestion(flag);
  });
  const roles = request.roles ?? [];
  if (roles.length > 0) questions[ROLE_KEY] = roleQuestion(roles);
  return questions;
}

/** The layers' answers as a plan's `flags` and `role`. */
export function layersFrom(
  request: MockPlanRequest,
  answers: Readonly<Record<string, Answer>>,
): Pick<MockPlan, "flags" | "role"> {
  const { flags, roles = [] } = request;
  const role = roles.length > 0 ? plannedRoleFrom(roles, required(answers, ROLE_KEY)) : undefined;
  return {
    ...(flags === undefined
      ? {}
      : { flags: flags.map((flag, i) => plannedFlagFrom(flag, required(answers, flagKey(i)))) }),
    ...(role === undefined ? {} : { role }),
  };
}

function required(answers: Readonly<Record<string, Answer>>, key: string): Answer {
  const answer = answers[key];
  if (answer === undefined) throw new Error(`jev returned no answer for "${key}".`);
  return answer;
}

/** The option for a flag the request leaves alone, and for a request naming no role. */
const UNCHANGED = "leave-unchanged";
const NOBODY = "no-role-named";

/** How a value is offered: a boolean as on or off, anything else as itself. */
export function valueLabel(value: FlagValue): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Whether, and to which of its values, the request sets one flag, named in the question. */
export function flagQuestion(flag: MockPlanFlag): ChoiceQuestion {
  const labels = flagValues(flag).map(valueLabel);
  const boolean = flag.type === "boolean";
  return {
    type: "choice",
    instructions:
      `The page evaluated the feature flag \`${flag.key}\`. Does the reviewer's \`request\`` +
      " want to see the page with this flag at one of its values? A request names a flag by" +
      " what it switches, in its own words; a word it shares with the page's data is not enough.",
    criteria: {
      ...Object.fromEntries(labels.map((label) => [label, wants(label, boolean)])),
      [UNCHANGED]: "The request says nothing about what this flag switches.",
    },
  };
}

/** What a request wanting one value says: "with it", "without it", or the value's name. */
function wants(label: string, boolean: boolean): string {
  if (!boolean) return `The request wants this flag at ${label}.`;
  return label === "on"
    ? "The request wants what the flag switches on: it asks for it, with it, or showing it."
    : "The request wants what the flag switches off: without it, hiding it, or turning it off.";
}

/** A flag's answer as its verdict: the likeliest value, and how likely it is. */
export function plannedFlagFrom(flag: MockPlanFlag, answer: Answer): PlannedFlag {
  const values = flagValues(flag);
  const shares = shared(answer, [...values.map(valueLabel), UNCHANGED]);
  const best = argmax(shares.slice(0, values.length));
  return plannedFlag(flag.key, values[best] ?? null, shares[best] ?? 0);
}

/** Who the request asks the page to be shown as, among the host's roles. */
export function roleQuestion(roles: readonly string[]): ChoiceQuestion {
  return {
    type: "choice",
    instructions:
      "Does the reviewer's `request` ask to see the page as someone signed in with one of" +
      ' these roles would, as in "as a guest", "for an owner" or "what a guest sees"? A role' +
      " word naming the page's data, such as a column, asks for no one.",
    criteria: {
      ...Object.fromEntries(
        roles.map((role) => [role, `The request asks to see the page as a ${role} would.`]),
      ),
      [NOBODY]: "The request does not ask to see the page as anyone in particular.",
    },
  };
}

/** The role's answer: the likeliest listed role, or none when naming none is likelier. */
export function plannedRoleFrom(roles: readonly string[], answer: Answer): PlannedRole | undefined {
  const shares = shared(answer, [...roles, NOBODY]);
  const best = argmax(shares);
  const role = roles[best];
  return role === undefined ? undefined : { role, p: shares[best] ?? 0 };
}

/** Each option's share of a `choice` answer, summing to one. */
function shared(answer: Answer, options: readonly string[]): number[] {
  const raw = options.map((option) => {
    const share = answer.probabilities?.[option];
    return typeof share === "number" && Number.isFinite(share) ? Math.max(0, share) : 0;
  });
  const total = raw.reduce((sum, share) => sum + share, 0);
  if (total > 0) return raw.map((share) => share / total);
  return options.map((option) => (option === answer.choice ? 1 : 0));
}

function argmax(values: readonly number[]): number {
  return values.reduce((best, value, index) => (value > (values[best] ?? 0) ? index : best), 0);
}
