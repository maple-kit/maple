import { describe, expect, it } from "vitest";

import { capabilitiesOf } from "../src/connectors/capabilities.js";
import {
  COMMENT_KINDS,
  DEFAULT_PILLARS,
  kindFromWeights,
  scoreAtPosition,
  selectPillars,
  UnknownPillarError,
} from "../src/connectors/classifier.js";
import { memoryClassifier } from "../src/testing/memory-classifier.js";

import type { Pillar } from "../src/connectors/types.js";

const THREE_RUNGS: Pillar = {
  id: "rungs",
  instruction: "Three rungs, so the arithmetic has something to land on.",
  levels: [
    { label: "low", description: "The bottom rung." },
    { label: "mid", description: "The middle rung." },
    { label: "high", description: "The top rung." },
  ],
};

describe("a score's arithmetic", () => {
  it("spends one unit of probability however many levels there are", () => {
    for (const pillar of DEFAULT_PILLARS) {
      for (const position of [0, 0.25, 0.5, 0.75, 1]) {
        const { distribution } = scoreAtPosition(pillar, position);

        expect(distribution.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 10);
      }
    }
  });

  it("names the rung the measurement landed nearest", () => {
    expect(scoreAtPosition(THREE_RUNGS, 0).level).toBe(0);
    expect(scoreAtPosition(THREE_RUNGS, 0.5).level).toBe(1);
    expect(scoreAtPosition(THREE_RUNGS, 1).level).toBe(2);
  });

  it("is less sure between two rungs than on one", () => {
    const onARung = scoreAtPosition(THREE_RUNGS, 1).confidence;
    const between = scoreAtPosition(THREE_RUNGS, 0.75).confidence;

    expect(between).toBeLessThan(onARung);
  });

  it("clamps a measurement that came from outside the range", () => {
    expect(scoreAtPosition(THREE_RUNGS, 4).level).toBe(2);
    expect(scoreAtPosition(THREE_RUNGS, -4).level).toBe(0);
  });

  it("refuses a pillar with no levels rather than dividing by nothing", () => {
    expect(() => scoreAtPosition({ ...THREE_RUNGS, levels: [] }, 0.5)).toThrow(RangeError);
  });
});

describe("a kind guess", () => {
  it("falls back rather than picking whichever kind sorts first", () => {
    expect(kindFromWeights({}).kind).toBe("other");
  });

  it("breaks a tie toward the earlier kind", () => {
    expect(kindFromWeights({ bug: 1, question: 1 }).kind).toBe("bug");
  });

  it("gives every kind a share, so one signal is never a certainty", () => {
    const { distribution, confidence } = kindFromWeights({ copy: 1 });

    expect(Object.keys(distribution)).toHaveLength(COMMENT_KINDS.length);
    expect(Object.values(distribution).every((share) => share > 0)).toBe(true);
    expect(confidence).toBe(distribution.copy);
  });
});

describe("the in-memory classifier", () => {
  it("reports every capability, and only the one a partly capable stub kept", () => {
    expect(capabilitiesOf("classifier", memoryClassifier())).toEqual({
      classify: true,
      plan: true,
      score: true,
    });
    expect(capabilitiesOf("classifier", memoryClassifier({ methods: ["classify"] }))).toEqual({
      classify: true,
      plan: false,
      score: false,
    });
  });

  it("plans the state and the calls its options name, and records the sentence", async () => {
    const classifier = memoryClassifier({ state: "empty", concerns: ["rest:GET /api/beans"] });
    const plan = await classifier.plan?.({
      request: "no beans",
      route: "/beans",
      calls: [
        { key: "rest:GET /api/beans", summary: "" },
        { key: "rest:GET /api/me", summary: "" },
      ],
    });

    expect(plan?.state).toBe("empty");
    expect(plan?.calls.map((call) => call.concerned)).toEqual([true, false]);
    expect(classifier.asked()).toEqual(["no beans"]);
  });

  it("remembers what it was asked, and forgets on reset", async () => {
    const classifier = memoryClassifier();
    await classifier.score?.({ body: "first" });
    await classifier.classify?.({ body: "second" });

    expect(classifier.asked()).toEqual(["first", "second"]);
    classifier.reset();
    expect(classifier.asked()).toEqual([]);
  });

  it("answers with the kind it was configured with", async () => {
    const guess = await memoryClassifier({ kind: "praise" }).classify?.({ body: "anything" });

    expect(guess?.kind).toBe("praise");
  });

  it("names itself and its pillars when asked for one it does not have", () => {
    const classifier = memoryClassifier({ name: "stub" });

    expect(() => selectPillars(classifier, ["tone"])).toThrow(UnknownPillarError);
    expect(() => selectPillars(classifier, ["tone"])).toThrow(/stub/);
  });
});
